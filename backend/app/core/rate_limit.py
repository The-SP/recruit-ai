"""Cost-weighted rate limiting for LLM spend.

Counts *units of LLM work*, not requests. Endpoint costs here are wildly
uneven -- a batch submit with 5 resumes is ~21 Gemini calls, a status poll is 0,
one spoken interview answer is 2 -- so a request counter would price them
identically and bound nothing.

There is exactly ONE bucket: a global daily ceiling across every caller. No
per-user, per-IP, or per-token buckets. That is a deliberate simplification for
a small deployment whose goal is "never spend more than X a day", not fairness
between tenants. The consequence is real and worth knowing: a single abusive
caller can exhaust the whole day's budget for everyone. If this ever serves an
audience that would notice, per-identity buckets go back in (bucket the key,
pick the limit per caller) -- but until then, one number is the whole policy.

This is the *proactive* half of spend control; worker/circuit_breaker.py is the
reactive half that fires after Gemini has already returned a 429.

Retry cooldowns below are a separate, orthogonal mechanism: they are keyed by
resource rather than by caller, and they exist because a unit budget alone would
let a hundred scripted retry clicks through as long as units remain.

Counting is deliberately approximate. Two concurrent requests can both read the
same total and both proceed, so the ceiling can be overshot by roughly one
request's cost. That is accepted: this is a spend guard, not an accounting
system, and the alternative (a Lua script to make check-then-add atomic) is
complexity a soft limit does not earn.

No FastAPI imports: scripts/ and Celery tasks read this too. The HTTP layer
(api/dependencies.py) owns turning a rejection into a 429; this module owns
policy and arithmetic only.
"""

from datetime import datetime, timedelta, timezone
from typing import cast

from redis.exceptions import RedisError

from app.config import Config
from app.core.logger import init_logger
from app.core.redis_client import get_redis

logger = init_logger(__name__)

KEY_PREFIX = "rl:"

# ---------------------------------------------------------------------------
# Limits
# ---------------------------------------------------------------------------

# Minimum gap between retry dispatches on one run. Retries are the one action a
# frustrated user will click repeatedly, and the daily budget alone would let a
# hundred scripted clicks through as long as units remain.
RETRY_COOLDOWN_SECONDS = 300

# The daily ceiling itself lives in Config.RATE_LIMIT_DAILY_GLOBAL_UNITS -- it
# is the one number worth retuning without a code change.

# ---------------------------------------------------------------------------
# Cost table -- one place to re-price when the pipeline changes
# ---------------------------------------------------------------------------

# core/job_description_parser.py: one call.
COST_JD_PARSE = 1

# One resume through worker/tasks.py evaluate_resume: a parse plus three
# scorers, so ~4 provider calls. Priced as a single "resume unit" because that
# is the unit users think in and the one MAX_ANONYMOUS_RESUMES already uses;
# the ratio between this and the others is what matters, not the absolute count.
COST_RESUME = 1

# POST /evaluations scores an already-parsed candidate: three scorer calls, no
# parse. Priced above COST_RESUME's nominal 1 so the cheap-looking direct
# endpoint cannot be used to dodge the resume price.
COST_COMPOSITE_SCORE = 3

# interview/engine.py _decide_followup: one call per typed answer.
COST_ANSWER_TEXT = 1

# Spoken answer: transcription (interview/transcriber.py) plus the same
# follow-up decision.
COST_ANSWER_AUDIO = 2

# interview/assessor.py, dispatched once when an interview closes.
COST_ASSESSMENT = 1

# health.py's liveness probe, charged only on a cache miss.
COST_HEALTH_PROBE = 1


def interview_invite_cost() -> int:
    """Units to create one interview invite.

    Script generation is 1 call (2 when the model's first output fails
    validation and question_generator retries), plus one TTS synthesis per
    question when voice is on -- by far the most expensive call in the pipeline,
    which is why it is priced per question rather than flat.
    """
    questions = Config.INTERVIEW_QUESTION_COUNT
    cost = 2  # script generation, assuming the retry
    if Config.INTERVIEW_VOICE == "on":
        cost += questions
    return cost


def _global_key() -> str:
    """Today's bucket, keyed by UTC calendar day.

    Calendar-day rather than a rolling 24h window from first use: a rolling
    window drifts, and a self-documenting key is far easier to read during an
    incident.
    """
    return f"{KEY_PREFIX}global:{datetime.now(timezone.utc):%Y-%m-%d}"


# Two days, so today's key survives long enough to be inspected after midnight.
# This is the key's TTL, NOT how long a throttled caller should wait -- the
# budget frees up at midnight when a new key starts. See _seconds_to_utc_midnight.
_GLOBAL_WINDOW_SECONDS = 172800


def _seconds_to_utc_midnight() -> int:
    """Seconds until the budget rolls over to a fresh key.

    The key's own TTL is deliberately longer than its usefulness (so it can be
    inspected the next morning), so it must never be handed to a caller as
    Retry-After: it would tell someone to wait two days for a budget that resets
    tonight.
    """
    now = datetime.now(timezone.utc)
    midnight = (now + timedelta(days=1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    return max(1, int((midnight - now).total_seconds()))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def consume(cost: int) -> int:
    """Charge `cost` units against today's global budget.

    Returns 0 when the caller may proceed, otherwise the seconds to wait.
    Never raises; api/dependencies.py turns a non-zero return into a 429.

    Read-then-add rather than add-then-refund: a rejected request must not burn
    units, or a caller with 2 units left could not do the 1-unit thing they were
    still entitled to. The read and the add are two round trips, so concurrent
    requests can overshoot the ceiling by about one request's cost. Accepted --
    see the module docstring.

    Fails OPEN when Redis is unreachable. Redis is also the Celery broker, so if
    it is down every enqueueing route is already broken and failing closed would
    only additionally kill the inline paths -- including hard-stopping a
    candidate mid-interview against a 15-minute clock they cannot pause. This is
    a cost guard, not a security boundary: spend is still backstopped by the
    reactive circuit breaker and by Gemini's own quota. Logged at ERROR rather
    than WARNING because a silent fail-open is how a limiter turns out to have
    been off for a month.
    """
    if Config.RATE_LIMIT_ENABLED == "off":
        return 0

    limit = Config.RATE_LIMIT_DAILY_GLOBAL_UNITS
    key = _global_key()

    try:
        client = get_redis()
        used = int(cast(bytes | None, client.get(key)) or 0)

        if used + cost > limit:
            # The key's TTL outlives the day it covers on purpose, so report the
            # real wait instead: the budget frees up at midnight.
            wait = _seconds_to_utc_midnight()
            log_only = _log_only()
            logger.warning(
                f"Rate limit {'would reject' if log_only else 'rejected'}: "
                f"cost={cost} used={used} limit={limit} retry_after={wait}"
            )
            return 0 if log_only else wait

        # EXPIRE nx only sets a TTL when the key has none, which covers both the
        # first write of the day and a key that somehow lost its expiry.
        # Pipelined so the pair is a single round trip.
        pipe = client.pipeline()
        pipe.incrby(key, cost)
        pipe.expire(key, _GLOBAL_WINDOW_SECONDS, nx=True)
        pipe.execute()
        return 0

    except RedisError as e:
        logger.error(f"Rate limiter unavailable, failing open: {e}")
        return 0


def _log_only() -> bool:
    """Whether the limiter counts and warns but never rejects."""
    return Config.RATE_LIMIT_ENABLED == "log"


def refund(cost: int) -> None:
    """Return units after a charge that produced no LLM spend.

    Only for routes that charge up front and then roll back -- resumes that
    never reached a worker, or an idempotent interview create that returned an
    existing interview. Not a general-purpose undo: the normal path never
    charges for work it does not do, because consume() checks before it adds.

    A no-op for cost <= 0, so callers can write the arithmetic inline without
    guarding it.

    The floor at zero is the load-bearing part: a refund crossing UTC midnight
    decrements the *new* day's key, which DECRBY would otherwise create at a
    negative value, quietly handing out free budget for the rest of that day.
    Clamping leaves the key at 0, which consume() reads identically to absent.
    """
    if cost <= 0 or Config.RATE_LIMIT_ENABLED == "off":
        return
    try:
        client = get_redis()
        key = _global_key()
        pipe = client.pipeline()
        pipe.decrby(key, cost)
        # nx: only sets a TTL if the decrement just created the key, so an
        # existing counter keeps its original expiry.
        pipe.expire(key, _GLOBAL_WINDOW_SECONDS, nx=True)
        if cast(int, pipe.execute()[0]) < 0:
            client.set(key, 0, keepttl=True)
    except RedisError as e:
        logger.error(f"Rate limit refund failed: {e}")


def cooldown(key: str, seconds: int) -> int:
    """Claim a one-per-`seconds` slot for `key`.

    Returns 0 when the slot was free (caller may proceed), otherwise the seconds
    remaining. SET NX EX, the same primitive activate_circuit_breaker already
    uses.

    Keyed by resource, not caller -- two people hammering retry on the same run
    share one cooldown. Fails open, for the same reasons consume() does.
    """
    if Config.RATE_LIMIT_ENABLED in ("off", "log"):
        return 0
    try:
        client = get_redis()
        full_key = f"{KEY_PREFIX}{key}"
        if client.set(full_key, "1", nx=True, ex=seconds):
            return 0
        remaining = cast(int, client.ttl(full_key))
        # TTL can race to -1/-2 if the key expired between SET and TTL; treat
        # that as "free" rather than inventing a wait.
        return remaining if remaining > 0 else 0
    except RedisError as e:
        logger.error(f"Rate limit cooldown check failed for key={key}: {e}")
        return 0


def peek() -> list[tuple[str, int, int]]:
    """List active keys as (key, used, ttl_seconds), for the CLI.

    SCAN rather than KEYS so it stays safe against a production keyspace.
    """
    client = get_redis()
    out: list[tuple[str, int, int]] = []
    for raw_key in client.scan_iter(match=f"{KEY_PREFIX}*", count=100):
        key = raw_key.decode() if isinstance(raw_key, bytes) else str(raw_key)
        value = cast(bytes | None, client.get(raw_key))
        ttl = cast(int, client.ttl(raw_key))
        try:
            used = int(value) if value is not None else 0
        except (TypeError, ValueError):
            # Cooldown markers hold "1"; anything else non-numeric we surface
            # as 0 rather than crashing the status command.
            used = 0
        out.append((key, used, ttl))
    return sorted(out)


def global_usage() -> tuple[int, int]:
    """Today's units used and the ceiling, for the CLI."""
    value = cast(bytes | None, get_redis().get(_global_key()))
    used = int(value) if value is not None else 0
    return used, Config.RATE_LIMIT_DAILY_GLOBAL_UNITS


def reset_global() -> bool:
    """Clear today's counter. Returns whether anything was deleted."""
    return bool(get_redis().delete(_global_key()))


# Budget keys are excluded from clear() by prefix rather than exact match:
# yesterday's key is still around (see _GLOBAL_WINDOW_SECONDS) and a blanket
# clear should not silently eat it either.
_GLOBAL_KEY_PREFIX = f"{KEY_PREFIX}global:"


def clear(key: str | None = None) -> int:
    """Delete rate limit keys, returning how many were removed.

    The manual escape hatch for a stuck retry/assess cooldown, which has no
    other release -- cooldown() short-circuits when the limiter is off, so an
    already-written marker survives even RATE_LIMIT_ENABLED=off until its TTL
    runs out.

    `key` is the unprefixed name, matching what cooldown() takes:
    "retry:<run_id>", "assess:<run_id>:<candidate_id>".

    Passing None clears every cooldown but deliberately leaves the daily budget
    alone -- zeroing the deployment's spend ceiling is a different decision, so
    it keeps its own command (reset_global).
    """
    client = get_redis()

    if key is not None:
        return int(cast(int, client.delete(f"{KEY_PREFIX}{key}")))

    removed = 0
    for raw_key in client.scan_iter(match=f"{KEY_PREFIX}*", count=100):
        name = raw_key.decode() if isinstance(raw_key, bytes) else str(raw_key)
        if name.startswith(_GLOBAL_KEY_PREFIX):
            continue
        removed += int(cast(int, client.delete(raw_key)))
    return removed

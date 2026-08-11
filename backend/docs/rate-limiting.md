# LLM Rate Limiting

How Gemini spend is bounded. One global daily budget, counted in units of LLM work
rather than requests, charged at the route before any model call happens.

Code: [`app/core/rate_limit.py`](../app/core/rate_limit.py), enforced via
[`app/api/dependencies.py`](../app/api/dependencies.py).

---

## 1. Units, not requests

Endpoint costs are wildly uneven. A batch submit with 5 resumes is roughly 21 Gemini
calls; a status poll is zero; a spoken interview answer is two. A limiter that counts
requests prices all three identically and therefore bounds nothing.

So the limiter counts **units of LLM work**. Prices live in one cost table in
`rate_limit.py`:

| Constant | Units | What it buys |
| --- | --- | --- |
| `COST_JD_PARSE` | 1 | One job description parse |
| `COST_RESUME` | 1 | One resume: a parse plus three scorers (~4 provider calls) |
| `COST_COMPOSITE_SCORE` | 3 | `POST /evaluations`, three scorers with no parse |
| `COST_ANSWER_TEXT` | 1 | One typed interview answer (follow-up decision) |
| `COST_ANSWER_AUDIO` | 2 | One spoken answer: transcription plus follow-up |
| `COST_ASSESSMENT` | 1 | One post-interview assessment |
| `COST_HEALTH_PROBE` | 1 | `/health/detailed`, charged only on a cache miss |
| `interview_invite_cost()` | 2 + N | Script generation, plus one TTS synthesis per question when voice is on |

A resume is priced at 1 even though it is ~4 provider calls, because that is the unit
users already think in and the one `MAX_ANONYMOUS_RESUMES` uses. The **ratios** matter,
not the absolute numbers. Re-price in the table, never at a call site.

Worked examples, at the default ceiling of 100 units/day:

| Scenario | Units | Whole budget spent on just this |
| --- | --- | --- |
| Anonymous trial run (1 JD + 5 resumes) | 6 | ~16 runs |
| Signed-in run, 20 resumes (no cap) | 21 | ~4 runs |
| Full audio interview, 5 questions, voice on | 18 | ~5 interviews |
| One resume via `POST /candidates` | 1 | 100 |

The interview breaks down as 7 to create the invite (2 for script generation, budgeting
for the validation retry, plus one TTS synthesis per question), 2 per spoken answer, and
1 to assess. Turning `INTERVIEW_VOICE=off` drops it from 18 to 13.

**That last column is not additive.** Every row draws on the same 100, so a real day is
more like:

```
2 trial runs           12
1 signed-in run (20)   21
3 interviews           54
                      ───
                       87 of 100
```

At which point one more interview gets a 429, and so does everyone else, until UTC
midnight. Three interviews is over half the day. This is the one-bucket trade-off in
concrete terms: a visitor kicking tyres on `/demo` and a candidate mid-interview are
spending from the same pool.

---

## 2. One bucket

There is exactly one counter: `rl:global:{YYYY-MM-DD}` in Redis, UTC, shared by every
caller. No per-user, per-IP, or per-token buckets, and no IP addresses are read
anywhere in the codebase.

This is a deliberate simplification for a small deployment whose goal is "never spend
more than X a day", not fairness between tenants.

**The accepted consequence: one noisy caller can exhaust the day for everyone**,
including you. That is the price of the simplicity. If this ever serves an audience
that would notice, per-identity buckets belong in `api/dependencies.py`, which already
isolates the decision behind `enforce_budget()`.

Counting is **deliberately approximate**. `consume()` reads the counter, compares, then
increments in a second round trip, so concurrent requests can overshoot the ceiling by
about one request's cost. This is a spend guard, not an accounting system, and making
check-then-add atomic is complexity a soft limit does not earn. Reading before adding
still matters, though, so a rejected request never burns units it was not going to use.

**Fails open when Redis is unreachable**, logged at ERROR. Redis is also the Celery
broker, so if it is down every enqueueing route is already broken; failing closed would
only additionally kill the inline paths and hard-stop a candidate mid-interview against
a clock they cannot pause. Spend is still backstopped by the circuit breaker and by
Gemini's own quota.

---

## 3. Where charging happens

`enforce_budget(cost)` is an explicit call at the top of each handler, after cheap
validation and **before** any model call or Celery dispatch. Same placement discipline
as `enforce_anonymous_resume_cap` in `core/file_upload.py`: a rejected request must cost
zero quota.

It is deliberately not a middleware or a router dependency, because cost depends on
`len(files)`, which only the handler knows. It is not inside `build_model()` either,
where there is no request context and a rejection would leave a half-finished run.

The trade-off this accepts: work already dispatched to Celery when the budget trips
still runs. That is the reactive circuit breaker's job, not this one's.

### The SSE seam

Both interview answer routes stream SSE, and **exception handlers cannot fire once a
response body has begun**. So `_precheck_answer` in `api/routes/interview.py` charges
last, after the mode gate and `engine.validate_answerable` pass, and both routes build
their `StreamingResponse` only after it returns.

The result: a throttled answer is a real `429` with `Content-Type: application/json`,
never an SSE `error` frame, while a stale `after_seq` stays a free `409`. **Keep that
ordering** if you touch those routes.

### Refunds

`refund(cost)` exists for rollback only: resumes that never reached a worker, or an
idempotent interview create that returned an existing interview. It never returns work
that already ran, so a JD parse whose model call happened is not refunded even when the
upload that followed it failed.

It is a no-op for `cost <= 0`, so callers write the arithmetic inline. The floor at zero
is load-bearing: a refund crossing UTC midnight decrements the *new* day's counter,
which would otherwise go negative and quietly hand out free budget.

---

## 4. Retry cooldowns

A separate, orthogonal mechanism. The daily budget alone would let a hundred scripted
retry clicks through as long as units remain, so retry-shaped endpoints also take a
cooldown keyed by **resource** rather than caller:

- `rl:retry:{run_id}` on the batch and owned-run retry endpoints
- `rl:assess:{run_id}:{candidate_id}` on manual assessment re-dispatch

One action per `RETRY_COOLDOWN_SECONDS` (300). Because they are keyed by resource, two
people hammering retry on the same run share one cooldown.

---

## 5. The 429

`RateLimitError` maps to a 429 in `api/exceptions.py` with `retry_after` in **both** the
body and the `Retry-After` header, because CORS hides response headers from JS by
default and the frontend reads the body.

`retry_after` is seconds until UTC midnight, deliberately **not** the Redis key's TTL.
The key lives for two days so the counter can be inspected the next morning; handing
that TTL to a caller would tell them to wait 48 hours for a budget that resets tonight.

The frontend surfaces `detail` verbatim, so the message in `dependencies.py` is
user-facing copy. `ApiError.retryAfter` carries the number for callers that want it.

---

## 6. Operations

```bash
make budget-status                        # units used today, limit, and mode
make budget-reset                         # clear today's counter right now
make rate-limit-status                    # the budget key plus any active cooldowns
make rate-limit-clear KEY=retry:<run-id>  # release one stuck cooldown
make rate-limit-clear                     # release all cooldowns (not the budget)
```

What self-heals and what does not:

| State | Clears by itself? |
| --- | --- |
| Daily budget | Yes, at UTC midnight |
| Retry / assess cooldown | Yes, after 300s |
| Circuit breaker | **No.** Needs `make circuit-reset` |

`make budget-reset` is the demo escape hatch: when the ceiling trips mid-demo, that
clears it immediately.

`RATE_LIMIT_ENABLED=off` lets everything through, including anything currently in
cooldown, because `cooldown()` returns "free" without reading Redis. But it does not
*delete* the cooldown key, so switching back to `on` re-applies whatever time is left on
it. `make rate-limit-clear` is what actually removes one.

Redis in production has no volume, so a restart wipes the budget and the circuit
breaker alike. Acceptable for a cost guard, surprising the first time it happens.

---

## 7. Configuration

Two env vars. Every other limit is a constant in `rate_limit.py`, following the same
rule as `interview/constants.py`.

| Var | Default | Notes |
| --- | --- | --- |
| `RATE_LIMIT_ENABLED` | `on` | `on` enforces, `log` counts and warns without rejecting, `off` skips Redis entirely |
| `RATE_LIMIT_DAILY_GLOBAL_UNITS` | `100` | The ceiling. Maps to real spend, which is why it is env and not a constant |

Both **default to their production values in code**, inverting the "code default is the
dev-friendly value" convention used by `INTERVIEW_MODE` and `INTERVIEW_QUESTION_COUNT`.
Those are cost *reducers*, where an unseeded deploy is merely expensive. These are cost
*guards*, where an unseeded deploy would be silently unprotected. Set
`RATE_LIMIT_ENABLED=off` in a local `.env` if the limits get in the way.

`log` is how to watch real traffic before enforcing. Flipping any of these needs a
process restart, since `Config` reads `os.getenv` at import.

100 units is a spend guard for a portfolio deployment, not a capacity setting.
**Raise it before demoing to an audience**, because when it trips every caller gets a
429 until UTC midnight.

---

## 8. Relationship to the circuit breaker

Two different mechanisms that are deliberately kept separate:

| | This limiter | `worker/circuit_breaker.py` |
| --- | --- | --- |
| Trigger | Proactive: our own ceiling | Reactive: Gemini already returned a 429 |
| Scope | Every route-level LLM unit | Celery batch tasks only |
| Recovery | Self-heals at UTC midnight | Latches until `make circuit-reset` |

The budget should never trip the breaker. Blurring "the provider said no" with "we said
no" would make the breaker's deliberately painful manual reset apply to a condition that
resolves on its own overnight.

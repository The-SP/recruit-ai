"""Read-only LLM usage stats, pulled from LangSmith for the admin page.

LangSmith is the system of record for per-call telemetry (tokens, latency,
errors, cost); this module only reads it back. Nothing is written to LangSmith
from here and nothing is persisted locally, so there is no second copy of the
numbers to drift.

One paginated run listing per window, aggregated here, rather than LangSmith's
`/runs/stats` endpoint: that endpoint is rate limited hard enough that a second
sequential call 429s, so one call per day and per model was never going to
work. The listing selects only numeric fields and metadata -- never inputs or
outputs -- so this path cannot pull prompt content even where
LANGSMITH_HIDE_INPUTS is off.

Only `run_type="llm"` runs are counted: one per provider call. The
create_agent wrappers that invoke_structured builds are chain runs and would
double-count.

Listing runs at roughly 2s per 100, so results are cached in process for
_CACHE_SECONDS per window, and a scan stops at _MAX_RUNS (flagged as
`truncated`). The cache is per API process, not shared; that is fine for an
admin page and keeps this off Redis.

No FastAPI imports: the route maps LlmUsageUnavailableError to a 503.
"""

import math
import threading
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Any

from langsmith import Client
from langsmith.utils import get_env_var

from app.core.logger import init_logger

logger = init_logger(__name__)

_CACHE_SECONDS = 300
_MAX_RUNS = 5000
_SELECT = [
    "start_time",
    "end_time",
    "prompt_tokens",
    "completion_tokens",
    "total_cost",
    "error",
    "extra",
]


class LlmUsageUnavailableError(Exception):
    """LangSmith could not be reached or rejected the request."""


@dataclass(frozen=True)
class UsageStats:
    calls: int
    errors: int
    prompt_tokens: int
    completion_tokens: int
    # Sum over priced calls only; None when no call in the slice had a price.
    cost: float | None
    # Calls LangSmith has no model price for, so `cost` undercounts by them.
    unpriced_calls: int
    latency_p50: float | None
    latency_p99: float | None


@dataclass(frozen=True)
class DailyUsage:
    day: date
    stats: UsageStats


@dataclass(frozen=True)
class ModelUsage:
    model: str
    stats: UsageStats


@dataclass(frozen=True)
class LlmUsage:
    project_name: str
    project_url: str | None
    days: int
    totals: UsageStats
    daily: list[DailyUsage]
    by_model: list[ModelUsage]
    # True when the scan hit _MAX_RUNS; every number is then a lower bound.
    truncated: bool
    fetched_at: datetime


def is_configured() -> bool:
    """Whether a LangSmith API key is set. Says nothing about tracing being on:
    an operator may turn tracing off and still want to read history."""
    return bool(get_env_var("API_KEY"))


def _project_name() -> str:
    return get_env_var("PROJECT") or "default"


@dataclass
class _Bucket:
    calls: int = 0
    errors: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cost: float | None = None
    unpriced_calls: int = 0
    latencies: list[float] = field(default_factory=list)

    def add(self, run: Any) -> None:
        self.calls += 1
        if run.error:
            self.errors += 1
        self.prompt_tokens += run.prompt_tokens or 0
        self.completion_tokens += run.completion_tokens or 0
        if run.total_cost is None:
            self.unpriced_calls += 1
        else:
            self.cost = (self.cost or 0.0) + float(run.total_cost)
        if run.end_time is not None:
            self.latencies.append((run.end_time - run.start_time).total_seconds())

    def freeze(self) -> UsageStats:
        return UsageStats(
            calls=self.calls,
            errors=self.errors,
            prompt_tokens=self.prompt_tokens,
            completion_tokens=self.completion_tokens,
            cost=self.cost,
            unpriced_calls=self.unpriced_calls,
            latency_p50=_percentile(self.latencies, 50),
            latency_p99=_percentile(self.latencies, 99),
        )


def _percentile(values: list[float], pct: int) -> float | None:
    """Nearest-rank percentile; None for an empty slice."""
    if not values:
        return None
    ordered = sorted(values)
    return ordered[max(0, math.ceil(pct / 100 * len(ordered)) - 1)]


def _utc_day(value: datetime) -> date:
    # LangSmith returns naive datetimes that are UTC.
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).date()


def _model_of(run: Any) -> str:
    metadata = (run.extra or {}).get("metadata") or {}
    return str(metadata.get("ls_model_name") or "unknown")


_client: Client | None = None
_project: tuple[str, str | None] | None = None
_cache: dict[int, tuple[float, LlmUsage]] = {}
_lock = threading.Lock()


def _get_client() -> Client:
    global _client
    if _client is None:
        _client = Client()
    return _client


def _get_project(client: Client) -> tuple[str, str | None]:
    """(project id, project url), looked up once per process."""
    global _project
    if _project is None:
        project = client.read_project(project_name=_project_name())
        _project = (str(project.id), project.url)
    return _project


def _fetch(days: int) -> LlmUsage:
    client = _get_client()
    project_id, project_url = _get_project(client)

    # UTC calendar days, matching the rate limiter's budget day.
    today = datetime.now(timezone.utc).date()
    first = today - timedelta(days=days - 1)
    since = datetime.combine(first, datetime.min.time(), timezone.utc)

    totals = _Bucket()
    daily: dict[date, _Bucket] = {
        first + timedelta(days=i): _Bucket() for i in range(days)
    }
    by_model: dict[str, _Bucket] = defaultdict(_Bucket)

    scanned = 0
    for run in client.list_runs(
        project_id=project_id,
        run_type="llm",
        start_time=since,
        select=_SELECT,
    ):
        # Not list_runs(limit=...): that is sent as the page size, which the
        # API caps at 100.
        if scanned >= _MAX_RUNS:
            break
        scanned += 1
        totals.add(run)
        day = daily.get(_utc_day(run.start_time))
        if day is not None:
            day.add(run)
        by_model[_model_of(run)].add(run)

    return LlmUsage(
        project_name=_project_name(),
        project_url=project_url,
        days=days,
        totals=totals.freeze(),
        daily=[DailyUsage(d, b.freeze()) for d, b in sorted(daily.items())],
        by_model=sorted(
            (ModelUsage(m, b.freeze()) for m, b in by_model.items()),
            key=lambda u: u.stats.calls,
            reverse=True,
        ),
        truncated=scanned >= _MAX_RUNS,
        fetched_at=datetime.now(timezone.utc),
    )


def get_usage(days: int) -> LlmUsage:
    """LLM usage for the last `days` UTC days, today included.

    Raises LlmUsageUnavailableError when LangSmith fails. Cached per window for
    _CACHE_SECONDS; a failure is never cached, so the next load retries.
    """
    with _lock:
        hit = _cache.get(days)
        if hit and time.monotonic() - hit[0] < _CACHE_SECONDS:
            return hit[1]

    try:
        usage = _fetch(days)
    except Exception as e:
        logger.error(f"LangSmith usage fetch failed: {e}")
        raise LlmUsageUnavailableError(str(e)) from e

    with _lock:
        _cache[days] = (time.monotonic(), usage)
    return usage

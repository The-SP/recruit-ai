import pytest

from app.config import Config
from app.core import rate_limit


@pytest.fixture(autouse=True)
def _limit(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(Config, "RATE_LIMIT_ENABLED", "on")
    monkeypatch.setattr(Config, "RATE_LIMIT_DAILY_GLOBAL_UNITS", 10)


def used() -> int:
    return rate_limit.global_usage()[0]


def test_charge_under_the_ceiling_is_counted() -> None:
    assert rate_limit.consume(4) == 0
    assert rate_limit.consume(6) == 0
    assert used() == 10


def test_charge_over_the_ceiling_is_rejected_and_costs_nothing() -> None:
    rate_limit.consume(8)
    wait = rate_limit.consume(3)
    assert wait > 0
    assert used() == 8
    assert rate_limit.consume(2) == 0


def test_refund_returns_units_and_never_goes_negative() -> None:
    rate_limit.consume(5)
    rate_limit.refund(3)
    assert used() == 2
    rate_limit.refund(10)
    assert used() == 0


def test_off_mode_never_rejects(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(Config, "RATE_LIMIT_ENABLED", "off")
    assert rate_limit.consume(1000) == 0


def test_log_mode_counts_but_never_rejects(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(Config, "RATE_LIMIT_ENABLED", "log")
    rate_limit.consume(10)
    assert rate_limit.consume(5) == 0


def test_cooldown_allows_one_action_per_window() -> None:
    assert rate_limit.cooldown("retry:run-1", 300) == 0
    assert rate_limit.cooldown("retry:run-1", 300) > 0
    assert rate_limit.cooldown("retry:run-2", 300) == 0

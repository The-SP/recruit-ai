from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.api.main import app
from helpers import Factory, budget_used, pdf_files

SUBMIT_FORM = {
    "job_text": "We need a backend engineer",
    "job_title": "Backend Engineer",
    "email": "someone@example.com",
}


def test_submit_creates_a_run_and_dispatches_it(
    client: TestClient, stub_jd_parse: MagicMock, dispatched: MagicMock
) -> None:
    res = client.post("/batch/submit", data=SUBMIT_FORM, files=pdf_files(5))

    assert res.status_code == 201, res.text
    body = res.json()
    assert body["uploaded"] == 5 and body["failed"] == 0
    dispatched.assert_called_once()
    assert budget_used() == 1 + 5  # JD parse + one unit per resume

    status = client.get(f"/batch/status/{body['token']}")
    assert status.status_code == 200
    assert status.json()["progress"]["total"] == 5


def test_submit_over_the_cap_is_rejected_before_any_spend(
    client: TestClient, stub_jd_parse: MagicMock, dispatched: MagicMock
) -> None:
    res = client.post("/batch/submit", data=SUBMIT_FORM, files=pdf_files(6))

    assert res.status_code == 400
    assert "limited to 5" in res.json()["detail"]
    stub_jd_parse.assert_not_called()
    dispatched.assert_not_called()
    assert budget_used() == 0


def test_rejected_files_are_refunded(
    client: TestClient, stub_jd_parse: MagicMock
) -> None:
    files = pdf_files(1) + [("files", ("fake.pdf", b"not a pdf", "application/pdf"))]
    res = client.post("/batch/submit", data=SUBMIT_FORM, files=files)

    assert res.status_code == 201
    assert res.json()["uploaded"] == 1 and res.json()["failed"] == 1
    assert budget_used() == 1 + 1  # the bad file's unit came back


def test_submit_when_budget_is_spent_returns_429(
    client: TestClient,
    stub_jd_parse: MagicMock,
    dispatched: MagicMock,
) -> None:
    from app.core import rate_limit

    rate_limit.consume(98)  # 2 of 100 left; this submit costs 1 + 5
    res = client.post("/batch/submit", data=SUBMIT_FORM, files=pdf_files(5))

    assert res.status_code == 429
    assert res.json()["retry_after"] > 0
    stub_jd_parse.assert_not_called()
    dispatched.assert_not_called()


@pytest.mark.parametrize(
    ("method", "suffix"),
    [("GET", ""), ("GET", "/job-description"), ("POST", "/retry-failed")],
    ids=["status", "job-description", "retry-failed"],
)
def test_unknown_token_is_404(client: TestClient, method: str, suffix: str) -> None:
    res = client.request(method, f"/batch/status/not-a-real-token{suffix}")
    assert res.status_code == 404


def test_add_candidates_respects_the_cap_across_calls(
    client: TestClient, make: Factory, dispatched: MagicMock
) -> None:
    run = make.run(total=3)
    url = f"/batch/status/{run.access_token}/add-candidates"

    over = client.post(url, files=pdf_files(3, prefix="extra"))
    assert over.status_code == 400
    assert "add 2 more" in over.json()["detail"]
    dispatched.assert_not_called()

    ok = client.post(url, files=pdf_files(2, prefix="extra"))
    assert ok.status_code == 200, ok.text
    assert ok.json()["uploaded"] == 2
    dispatched.assert_called_once()


def test_retry_failed_requeues_then_cools_down(
    client: TestClient, make: Factory, dispatched: MagicMock
) -> None:
    run = make.run(status="completed")
    make.scored_candidate(run, status="failed")
    url = f"/batch/status/{run.access_token}/retry-failed"

    first = client.post(url)
    assert first.status_code == 200, first.text
    assert first.json()["retried"] == 1
    dispatched.assert_called_once()

    # Run is pending again, so a second click is refused outright.
    assert client.post(url).status_code == 400


def test_batch_surface_has_no_interview_routes() -> None:
    paths = [getattr(r, "path", "") for r in app.routes]
    assert not [p for p in paths if p.startswith("/batch") and "interview" in p]


def test_batch_surface_has_no_run_listing() -> None:
    paths = {getattr(r, "path", "") for r in app.routes}
    assert "/batch" not in paths and "/batch/runs" not in paths

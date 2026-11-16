import re
from typing import Any
from uuid import uuid4

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from app.api.main import app
from helpers import Factory, all_keys, auth, budget_used, pdf_files

# Every /admin route, so one added later is covered without a new test.
ADMIN_ROUTES = sorted(
    (method, re.sub(r"\{[^}]+\}", str(uuid4()), route.path))
    for route in app.routes
    if isinstance(route, APIRoute) and route.path.startswith("/admin")
    for method in route.methods
)
ADMIN_IDS = [f"{method} {path}" for method, path in ADMIN_ROUTES]


def test_me_returns_the_signed_in_user(client: TestClient, make: Factory) -> None:
    user = make.user()
    res = client.get("/auth/me", headers=auth(user))
    assert res.status_code == 200
    assert res.json()["email"] == user.email
    assert res.json()["is_admin"] is False


def test_garbage_token_is_rejected(client: TestClient) -> None:
    res = client.get("/auth/me", headers={"Authorization": "Bearer not-a-jwt"})
    assert res.status_code == 401


def test_inactive_user_is_rejected(client: TestClient, make: Factory) -> None:
    res = client.get("/auth/me", headers=auth(make.user(active=False)))
    assert res.status_code == 400


def test_admin_routes_exist() -> None:
    # Guards the parametrized tests below from silently collecting nothing.
    assert ADMIN_ROUTES


@pytest.mark.parametrize(("method", "path"), ADMIN_ROUTES, ids=ADMIN_IDS)
def test_admin_route_requires_a_token(
    client: TestClient, method: str, path: str
) -> None:
    assert client.request(method, path).status_code == 401


@pytest.mark.parametrize(("method", "path"), ADMIN_ROUTES, ids=ADMIN_IDS)
def test_admin_route_rejects_non_admins(
    client: TestClient, make: Factory, method: str, path: str
) -> None:
    assert client.request(method, path, headers=auth(make.user())).status_code == 403


def test_admin_allows_admins(client: TestClient, make: Factory) -> None:
    res = client.get("/admin/stats", headers=auth(make.user(admin=True)))
    assert res.status_code == 200


def test_admin_run_list_never_exposes_access_tokens(
    client: TestClient, make: Factory
) -> None:
    anon_run = make.run()
    res = client.get("/admin/runs", headers=auth(make.user(admin=True)))
    assert res.status_code == 200
    assert "access_token" not in all_keys(res.json())
    assert anon_run.access_token not in res.text


def test_basic_health_is_public(client: TestClient) -> None:
    assert client.get("/health").status_code == 200


def test_detailed_health_is_admin_only(client: TestClient, make: Factory) -> None:
    res = client.get("/health/detailed", headers=auth(make.user()))
    assert res.status_code == 403


def test_user_cannot_read_another_users_run(client: TestClient, make: Factory) -> None:
    owner, other = make.user(), make.user()
    run = make.run(user=owner)
    url = f"/evaluations/runs/{run.id}"

    assert client.get(url, headers=auth(owner)).status_code == 200
    assert client.get(url, headers=auth(other)).status_code == 404

    listed = client.get("/evaluations/runs", headers=auth(other)).json()
    assert str(run.id) not in str(listed)


@pytest.mark.parametrize(
    ("method", "suffix", "body"),
    [
        ("POST", "", None),
        ("GET", "", None),
        ("GET", "/audio/2", None),
        ("POST", "/send-invite", {"email": "x@example.com"}),
    ],
    ids=["create", "read", "audio", "send-invite"],
)
def test_user_cannot_touch_interviews_on_another_users_run(
    client: TestClient, make: Factory, method: str, suffix: str, body: Any
) -> None:
    run = make.run(user=make.user())
    candidate, evaluation, _ = make.scored_candidate(run)
    make.interview(evaluation)
    url = f"/evaluations/runs/{run.id}/candidate/{candidate.id}/interview{suffix}"

    res = client.request(method, url, headers=auth(make.user()), json=body)

    assert res.status_code == 404
    assert budget_used() == 0


def test_signed_in_run_is_owned_and_uncapped(
    client: TestClient, make: Factory, stub_jd_parse: object
) -> None:
    user = make.user()
    res = client.post(
        "/evaluations/runs",
        headers=auth(user),
        data={
            "job_text": "We need a backend engineer",
            "job_title": "Backend Engineer",
        },
        files=pdf_files(6),
    )
    assert res.status_code == 201, res.text
    url = f"/evaluations/runs/{res.json()['id']}"

    assert client.get(url, headers=auth(user)).status_code == 200
    assert client.get(url, headers=auth(make.user())).status_code == 404

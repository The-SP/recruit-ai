import sys
from collections.abc import Iterator
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock

from dotenv import load_dotenv

# Must run before any app import: Config reads the environment at import time.
load_dotenv(Path(__file__).parent.parent / ".env.test", override=True)

import fakeredis  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import URL, Connection, create_engine, text  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.api.main import app  # noqa: E402
from app.core import file_storage, model_factory, redis_client  # noqa: E402
from app.models import Base, database  # noqa: E402
from app.models.database import get_db  # noqa: E402
from app.worker import interview_tasks, tasks  # noqa: E402
from helpers import Factory, valid_jd  # noqa: E402


def _patch_everywhere(
    monkeypatch: pytest.MonkeyPatch, original: object, replacement: object
) -> None:
    """Patch every `from x import f` copy, not just x.f."""
    for name, module in list(sys.modules.items()):
        if not name.startswith("app") or module is None:
            continue
        for attr, value in list(vars(module).items()):
            if value is original:
                monkeypatch.setattr(module, attr, replacement)


def _ensure_database(url: URL) -> None:
    admin = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        exists = conn.scalar(
            text("SELECT 1 FROM pg_database WHERE datname = :name"),
            {"name": url.database},
        )
        if not exists:
            conn.execute(text(f'CREATE DATABASE "{url.database}"'))
    admin.dispose()


@pytest.fixture(scope="session")
def _schema() -> Iterator[None]:
    _ensure_database(database.engine.url)
    Base.metadata.drop_all(database.engine)
    Base.metadata.create_all(database.engine)
    yield
    Base.metadata.drop_all(database.engine)


@pytest.fixture
def db_conn(_schema: None) -> Iterator[Connection]:
    conn = database.engine.connect()
    outer = conn.begin()
    yield conn
    outer.rollback()
    conn.close()


@pytest.fixture
def db(db_conn: Connection) -> Iterator[Session]:
    # Repository commits only release a savepoint; the outer rollback wins.
    session = Session(bind=db_conn, join_transaction_mode="create_savepoint")
    yield session
    session.close()


@pytest.fixture(autouse=True)
def _route_sessions(
    request: pytest.FixtureRequest, monkeypatch: pytest.MonkeyPatch
) -> Iterator[None]:
    # Skipped when unused, so pure unit tests run without Postgres.
    if "db" not in request.fixturenames:
        yield
        return
    conn: Connection = request.getfixturevalue("db_conn")

    def new_session() -> Session:
        return Session(bind=conn, join_transaction_mode="create_savepoint")

    def override_get_db() -> Iterator[Session]:
        session = new_session()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    _patch_everywhere(monkeypatch, database.create_session, new_session)
    yield
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def fake_redis(monkeypatch: pytest.MonkeyPatch) -> fakeredis.FakeRedis:
    client = fakeredis.FakeRedis()
    monkeypatch.setattr(redis_client, "_client", client)
    return client


@pytest.fixture(autouse=True)
def _tmp_storage(monkeypatch: pytest.MonkeyPatch, tmp_path: Any) -> None:
    monkeypatch.setattr(file_storage, "LOCAL_STORAGE_ROOT", tmp_path)


@pytest.fixture(autouse=True)
def dispatched(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    mock = MagicMock()
    monkeypatch.setattr(tasks.process_evaluation_run, "delay", mock)
    monkeypatch.setattr(interview_tasks.assess_interview, "delay", MagicMock())
    return mock


@pytest.fixture(autouse=True)
def _no_llm(monkeypatch: pytest.MonkeyPatch) -> None:
    def refuse(*args: Any, **kwargs: Any) -> Any:
        raise AssertionError("LLM called in tests")

    _patch_everywhere(monkeypatch, model_factory.invoke_structured, refuse)
    _patch_everywhere(monkeypatch, model_factory.build_model, refuse)


@pytest.fixture
def client(db: Session) -> TestClient:
    # Depends on db so every API test runs inside the rolled-back transaction.
    return TestClient(app)


@pytest.fixture
def stub_jd_parse(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    mock = MagicMock(return_value=valid_jd())
    from app.api.routes import batch, user_runs

    monkeypatch.setattr(batch, "parse_job_description", mock)
    monkeypatch.setattr(user_runs, "parse_job_description", mock)
    return mock


@pytest.fixture
def make(db: Session) -> Factory:
    return Factory(db)

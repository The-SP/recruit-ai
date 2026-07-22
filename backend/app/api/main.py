from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.api.dependencies import verify_api_key
from app.api.exceptions import register_exception_handlers
from app.api.routes import auth, batch, candidates, evaluations, health, jobs, user_runs
from app.config import Config
from app.core.logger import init_logger

logger = init_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan manager."""
    logger.info("Starting Recruit AI API")
    yield
    logger.info("Shutting down Recruit AI API")


def create_app() -> FastAPI:
    app = FastAPI(
        title="Recruit AI",
        description="LLM-Enhanced Resume Screening System",
        lifespan=lifespan,
    )

    # Session middleware (required for OAuth state handling)
    app.add_middleware(SessionMiddleware, secret_key=Config.SECRET_KEY)

    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[Config.FRONTEND_URL],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Exception handlers
    register_exception_handlers(app)

    # Routes
    api_key_auth = [Depends(verify_api_key)]
    app.include_router(health.router)
    app.include_router(auth.router, prefix="/auth", tags=["auth"])
    # Authenticated user routes (JWT Bearer) — registered before evaluations to avoid path conflict
    app.include_router(user_runs.runs_router)
    app.include_router(user_runs.dashboard_router)
    app.include_router(jobs.router, dependencies=api_key_auth)
    app.include_router(candidates.router, dependencies=api_key_auth)
    app.include_router(evaluations.router, dependencies=api_key_auth)
    app.include_router(batch.router, dependencies=api_key_auth)

    return app


app = create_app()

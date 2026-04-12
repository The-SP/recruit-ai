from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.dependencies import verify_api_key
from app.api.exceptions import register_exception_handlers
from app.api.routes import batch, candidates, evaluations, health, jobs
from app.config import Config
from app.core.logger import init_logger

logger = init_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
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
    auth = [Depends(verify_api_key)]
    app.include_router(health.router)
    app.include_router(jobs.router, dependencies=auth)
    app.include_router(candidates.router, dependencies=auth)
    app.include_router(evaluations.router, dependencies=auth)
    app.include_router(batch.router, dependencies=auth)

    return app


app = create_app()

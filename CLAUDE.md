# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Recruit AI is an AI-powered resume screening system. Users upload PDF resumes and a job description, and the system scores candidates using Google Gemini (via LangChain). It supports both single-candidate evaluation and batch processing with email notifications.

## Tech Stack

- **Backend:** Python 3.13+, FastAPI, SQLAlchemy, Celery (Redis broker), Alembic, LangChain + Gemini
- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Radix UI
- **Infrastructure:** PostgreSQL 16, Redis 7, Docker Compose
- **Package managers:** `uv` (backend), `pnpm` (frontend)

## Setup

```bash
# Backend (from backend/)
uv sync                # Install Python dependencies
cp .env.example .env   # Configure env vars (at minimum: GOOGLE_API_KEY)
docker compose up -d   # Start PostgreSQL (5433) and Redis (6380)
make migrate           # Run database migrations

# Frontend (from frontend/)
pnpm install
# Create .env.local with NEXT_PUBLIC_API_URL=http://localhost:8000
```

**Port gotcha:** Docker maps PostgreSQL to **5433** and Redis to **6380** on the host. When running locally against Docker services, use `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/recruit-ai` and `REDIS_URL=redis://localhost:6380/0` (not the default ports in `.env.example`).

## Common Commands

### Backend (run from `backend/`)

```bash
make dev              # Start FastAPI server with hot reload
make worker           # Start Celery worker
make flower           # Start Flower (Celery monitoring UI)
make lint             # Run ruff linter
make format           # Run ruff formatter
make migrate          # Run alembic upgrade head
make migrate-create m="description"  # Create new migration
make migrate-down     # Downgrade one migration
make circuit-status   # Check circuit breaker status
make circuit-reset    # Reset circuit breaker (after rate limit hits)
```

All Python commands use `uv run` (e.g., `uv run ruff check .`).

### Frontend (run from `frontend/`)

```bash
pnpm dev              # Start Next.js dev server (port 3000)
pnpm build            # Production build
pnpm lint             # Run ESLint
```

### Docker (from `backend/`)

```bash
docker compose up     # Start PostgreSQL (5433), Redis (6380), API (8000), Worker
```

### Testing

There is no test suite yet. The project uses `pre-commit` hooks (in dev dependencies).

## Architecture

### Backend (`backend/app/`)

The backend follows a layered architecture: **routes → services/scorers → repositories → models**.

- **`api/`** — FastAPI routes (`routes/`) and Pydantic request/response schemas (`schemas/`). Entry point is `api/main.py` which creates the app via `create_app()`. Route files: `batch.py`, `candidates.py`, `jobs.py`, `evaluations.py`, `health.py`. Custom exception handlers in `api/exceptions.py`.

- **`core/`** — Business logic: `resume_parser.py` (PDF → markdown + structured data via Gemini), `job_description_parser.py` (text → structured requirements via Gemini, validates input is a real JD), `file_upload.py` (PDF validation), `file_storage.py` (local storage for batch uploads), `logger.py` (console + optional file logging).

- **`evaluation/`** — Three-component scoring engine orchestrated by `composite_scorer.py`:
  - `skill_scorer.py` (45% weight) — LangChain agent evaluates skill matches. Match types: Exact (1.0), Equivalent (0.85), Transferable (0.65), Foundational (0.40), None (0.0). Skill tiers: Critical (dealbreaker), Required (85% weight), Preferred (15% weight).
  - `experience_scorer.py` (40% weight) — Evaluates work history relevance and years.
  - `education_scorer.py` (15% weight) — Evaluates degree level and field match. More lenient for tech roles.
  - Weights redistribute dynamically when requirements are missing. Hire signal thresholds: Strong Match (>=0.85), Good Match (0.70-0.84), Partial Match (0.55-0.69), Weak Match (0.40-0.54), No Match (<0.40).

- **`models/`** — SQLAlchemy ORM models. Core tables: `candidates`, `jobs`, `job_requirements`, `candidate_evaluations`, `evaluation_runs`, `evaluation_run_items`. `candidate_evaluations` has a unique constraint on `(candidate_id, job_id)` to support upsert re-evaluation.

- **`repositories/`** — Data access layer. `evaluation_run_repository.py` manages status transitions: draft → pending → processing → completed/failed.

- **`worker/`** — Celery tasks using chord pattern: `process_evaluation_run` (orchestrator) → `evaluate_resume` (parallel per-resume) → `finalize_evaluation_run` (callback, sends email). Includes `circuit_breaker.py` for Gemini rate limit protection — detects quota errors, sets a Redis flag to block new tasks, requires manual reset via `make circuit-reset`.

- **`services/`** — `email_service.py` with pluggable providers: `ConsoleProvider` (local dev, logs to stdout), `GmailProvider` (SMTP), `ResendProvider` (API). Set via `EMAIL_PROVIDER` env var (`console`|`gmail`|`resend`).

- **`config.py`** — Environment variable loading. LLM model configured via `MODEL_NAME` env var (default: `google_genai:gemini-2.5-flash-lite`).

### Frontend (`frontend/`)

Next.js App Router structure. Pages:
- `app/page.tsx` — Landing page with upload form (`components/submit-form.tsx`). Submits to `POST /batch/submit`, redirects to `/evaluation?token=<token>`.
- `app/evaluation/page.tsx` — Results dashboard: batch status polling, candidate list with expandable score breakdowns, add-more-candidates, CSV export.
- `app/history/page.tsx` — Lists past evaluation runs.

API calls are in `services/batch.ts` (batch endpoints) and `services/api.ts` (generic request wrapper).

## Configuration

Backend env vars are documented in `backend/.env.example`. Key variables: `GOOGLE_API_KEY`, `DATABASE_URL`, `REDIS_URL`, `EMAIL_PROVIDER` (console|gmail|resend), `MODEL_NAME`, `BASE_URL`, `FRONTEND_URL`, `LOG_LEVEL`, `LOG_TO_FILE`.

Frontend uses `NEXT_PUBLIC_API_URL` (default: `http://localhost:8000`).

## Code Quality

- **Backend:** Ruff for linting/formatting (only `I`/isort rules enabled), MyPy strict mode, `alembic/` excluded from both
- **Frontend:** ESLint with Next.js config, TypeScript strict

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Recruit AI is an AI-powered resume screening system. Users upload PDF resumes and a job description, and the system scores candidates using Google Gemini (via LangChain). It supports both single-candidate evaluation and batch processing with email notifications.

## Tech Stack

- **Backend:** Python 3.13+, FastAPI, SQLAlchemy, Celery (Redis broker), Alembic, LangChain + Gemini
- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Radix UI
- **Infrastructure:** PostgreSQL 16, Redis 7, Docker Compose
- **Package managers:** `uv` (backend), `pnpm` (frontend)

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
pnpm dev              # Start Next.js dev server
pnpm build            # Production build
pnpm lint             # Run ESLint
```

### Docker (from `backend/`)

```bash
docker compose up     # Start PostgreSQL (5433), Redis (6380), API (8000), Worker
```

Note: Docker maps PostgreSQL to port 5433 and Redis to 6380 on the host.

## Architecture

### Backend (`backend/app/`)

The backend follows a layered architecture: **routes → services/scorers → repositories → models**.

- **`api/`** — FastAPI routes (`routes/`) and Pydantic request/response schemas (`schemas/`). Route files:
  - `batch.py` — Public batch API: `POST /batch/submit`, `GET /batch/status/{token}`, `POST /batch/status/{token}/add-candidates`, `GET /batch/status/{token}/candidate/{candidate_id}`, `GET /batch/history`. Also internal multi-step draft API (`POST /batch`, file upload/listing/deletion, `POST /batch/{run_id}/start`, `GET /batch/{run_id}/results`).
  - `candidates.py` — `POST /candidates`, `GET /candidates/{id}`, `GET /candidates`
  - `jobs.py` — `POST /jobs`, `GET /jobs/{id}`, `GET /jobs`, `GET /jobs/{id}/rankings`
  - `evaluations.py` — `POST /evaluations`, `GET /evaluations/{id}`
  - `health.py` — `GET /health`, `GET /health/detailed` (checks DB, Redis, Celery, LLM)

- **`core/`** — Business logic: `resume_parser.py` (PDF → markdown + structured data via Gemini), `job_description_parser.py` (text → structured requirements via Gemini, validates input is a real JD), `file_upload.py` (PDF validation), `file_storage.py` (local storage for batch uploads), `logger.py` (console + optional file logging).

- **`evaluation/`** — Three-component scoring engine orchestrated by `composite_scorer.py`:
  - `skill_scorer.py` (45% weight) — LangChain agent evaluates skill matches. Match types: Exact (1.0), Equivalent (0.85), Transferable (0.65), Foundational (0.40), None (0.0). Skill tiers: Critical (dealbreaker), Required (85% weight), Preferred (15% weight).
  - `experience_scorer.py` (40% weight) — Evaluates work history relevance and years. Relevance levels: High (1.0), Medium (0.6), Low (0.25), None (0.0).
  - `education_scorer.py` (15% weight) — Evaluates degree level and field match. More lenient for tech roles.
  - Weights redistribute dynamically when requirements are missing. Hire signal thresholds: Strong Match (≥0.85), Good Match (0.70–0.84), Partial Match (0.55–0.69), Weak Match (0.40–0.54), No Match (<0.40).

- **`models/`** — SQLAlchemy ORM models. Core tables: `candidates`, `jobs`, `job_requirements`, `candidate_evaluations`, `evaluation_runs`, `evaluation_run_items`. `candidate_evaluations` has a unique constraint on `(candidate_id, job_id)` to support upsert re-evaluation.

- **`repositories/`** — Data access layer: `candidate_repository.py`, `job_repository.py`, `evaluation_repository.py`, `evaluation_run_repository.py` (also manages `evaluation_run_items` and status transitions: draft → pending → processing → completed/failed).

- **`worker/`** — Celery tasks using chord pattern: `process_evaluation_run` (orchestrator) → `evaluate_resume` (parallel per-resume) → `finalize_evaluation_run` (callback, sends email). Includes `circuit_breaker.py` for Gemini rate limit protection — detects quota errors, sets a Redis flag to block new tasks, and requires manual reset via `make circuit-reset`.

- **`services/`** — `email_service.py` with pluggable providers: `GmailProvider` (SMTP, requires app password) and `ResendProvider` (Resend API for custom domains). Sends batch completion/failure notifications with result links.

- **`config.py`** — Environment variable loading. LLM model configured via `MODEL_NAME` env var (default: `google_genai:gemini-2.5-flash-lite`).

### Frontend (`frontend/`)

Next.js App Router structure. Pages:
- `app/page.tsx` — Landing page with hero, how-it-works, and upload form (`components/submit-form.tsx`). Submits to `POST /batch/submit`, redirects to `/evaluation?token=<token>`.
- `app/evaluation/page.tsx` — Results dashboard: batch status polling, candidate list with expandable score breakdowns, add-more-candidates feature, CSV export.
- `app/history/page.tsx` — Lists past evaluation runs from `GET /batch/history`.

API calls are in `services/batch.ts` (batch endpoints) and `services/api.ts` (generic request wrapper).

## Configuration

Backend env vars are documented in `backend/.env.example`. Key variables: `GOOGLE_API_KEY`, `DATABASE_URL`, `REDIS_URL`, `EMAIL_PROVIDER` (gmail|resend), `MODEL_NAME`, `BASE_URL`, `FRONTEND_URL`, `LOG_LEVEL`, `LOG_TO_FILE`.

Frontend uses `NEXT_PUBLIC_API_URL` (default: `http://localhost:8000`).

## Code Quality

- **Backend:** Ruff for linting/formatting (only `I`/isort rules enabled), MyPy strict mode, `alembic/` excluded from both
- **Frontend:** ESLint with Next.js config, TypeScript strict

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Recruit AI is an AI-powered resume screening system. Users upload PDF resumes and a job description, and the system scores candidates using Google Gemini (via LangChain). There are two entry paths: signed-in users own their evaluation runs (Google OAuth), and an anonymous token-based batch flow lets anyone submit and get results via an unguessable link plus email notification.

The anonymous flow is a **trial surface**, not a workspace: it is capped at 5 resumes per run (`MAX_ANONYMOUS_RESUMES` in `core/file_upload.py`) and cannot create AI interviews. Both are deliberate — signing in does not carry an anonymous run over, so those users start a fresh evaluation.

## Tech Stack

- **Backend:** Python 3.13+, FastAPI, SQLAlchemy, Celery (Redis broker), Alembic, LangChain + Gemini
- **Auth:** Google OAuth (authlib) + JWT (`joserfc`, not python-jose/pyjwt)
- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Radix UI, Shadcn UI
- **Infrastructure:** PostgreSQL 16, Redis 7, Docker Compose; AWS in production (EC2, RDS, S3, SSM Parameter Store)
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
make seed-ssm         # Seed SSM Parameter Store from an env file (prod bootstrap)
```

All Python commands use `uv run` (e.g., `uv run ruff check .`). CI runs `ruff format --check`, so run `make format` before pushing.

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

There is no test suite yet — no pytest, no vitest, no test files anywhere in the repo.

## Architecture

### Backend (`backend/app/`)

The backend follows a layered architecture: **routes → services/scorers → repositories → models**.

- **`api/`** — FastAPI routes (`routes/`) and HTTP request/response schemas (`schemas/`). Entry point is `api/main.py` which creates the app via `create_app()`. Route files: `auth.py`, `batch.py`, `candidates.py`, `jobs.py`, `evaluations.py`, `user_runs.py`, `health.py`. Custom exception handlers in `api/exceptions.py`.

  **Two auth schemes coexist.** `verify_api_key` (`api/dependencies.py`) checks an `X-API-Key` header on jobs/candidates/evaluations/batch, and is a **no-op when `API_KEY` is empty**. JWT Bearer auth is required on `/evaluations/runs/*`, `/dashboard/*`, and `/auth/me`. The anonymous batch flow has no user; it is protected only by unguessable access tokens in the URL. Because that token is shareable and has no account behind it, the anonymous surface is bounded in two ways: uploads are capped via `enforce_anonymous_resume_cap` (called **before** the per-file loop — the loops fold `ValidationError` into a per-file `errors` list, so a cap raised inside one would never reach the client as a 400), and interviews are excluded entirely.

  **Router order is load-bearing:** `user_runs.runs_router` is registered *before* `evaluations.router` so `/evaluations/runs` isn't captured by `/evaluations/{evaluation_id}`.

- **`auth/`** — `jwt.py` (HS256 via `joserfc`, 7-day expiry; the `sub` claim is the **Google ID**, not the user UUID) and `oauth.py` (authlib Google OIDC client). `SessionMiddleware` in `api/main.py` is required for OAuth state.

- **`core/`** — `resume_parser.py` (PDF → markdown + structured data via Gemini), `job_description_parser.py` (text → structured requirements, validates input is a real JD), `file_upload.py` (PDF validation), `file_storage.py`, `model_factory.py`, `logger.py`.

  - `file_storage.py` is a façade over `core/storage/` (`base.py` ABC, `local.py`, `s3.py`), selected by the `USE_S3` env var. Prefer the façade functions over instantiating a backend directly.
  - `model_factory.py` — **all LLM call sites go through `build_model()`**, never `init_chat_model` directly. It round-robins across `GOOGLE_API_KEYS` using a Redis `INCR` cursor, so rotation stays consistent across separate Celery worker processes.

- **`evaluation/`** — Three-component scoring engine orchestrated by `composite_scorer.py`:
  - `skill_scorer.py` (45% weight) — LangChain agent evaluates skill matches. Match types: Exact (1.0), Equivalent (0.85), Transferable (0.65), Foundational (0.40), None (0.0). Skill tiers: Critical (dealbreaker), Required (85% weight), Preferred (15% weight).
  - `experience_scorer.py` (40% weight) — Evaluates work history relevance and years.
  - `education_scorer.py` (15% weight) — Evaluates degree level and field match. More lenient for tech roles.
  - Weights redistribute dynamically when requirements are missing. Hire signal thresholds: Strong Match (>=0.85), Good Match (0.70-0.84), Partial Match (0.55-0.69), Weak Match (0.40-0.54), No Match (<0.40).

- **`models/`** — SQLAlchemy ORM models. Tables: `users`, `candidates`, `jobs`, `job_requirements`, `candidate_evaluations`, `evaluation_runs`, `evaluation_run_items`. `candidate_evaluations` has a unique constraint on `(candidate_id, job_id)` to support upsert re-evaluation. `EvaluationRun.user_id` and `Job.user_id` are **nullable** — that's how anonymous batch runs coexist with owned ones.

- **`repositories/`** — Data access layer, one module per aggregate. `evaluation_run_repository.py` manages status transitions: draft → pending → processing → completed/failed.

- **`schemas/`** — Domain/LLM Pydantic schemas (scoring output, parsed resumes and JDs). Distinct from `api/schemas/`, which holds HTTP-facing models. Don't conflate the two.

- **`worker/`** — Celery tasks using chord pattern: `process_evaluation_run` (orchestrator) → `evaluate_resume` (parallel per-resume) → `finalize_evaluation_run` (callback, sends email), with `on_chord_error` wired via `link_error`. Includes `circuit_breaker.py` for Gemini rate limit protection — detects quota errors, sets a Redis flag to block new tasks, requires manual reset via `make circuit-reset`.

- **`services/`** — `email_service.py` with pluggable providers: `ConsoleProvider` (local dev, logs to stdout), `GmailProvider` (SMTP), `ResendProvider` (API). Set via `EMAIL_PROVIDER`. Templates in `app/templates/emails/`.

- **`interview/`** — AI interviewer: question generation, the turn engine in `engine.py`, verbatim speech-to-text in `transcriber.py`, the post-interview assessor, and a shared create/detail/reissue service. Its routes are deliberately split two ways: candidate endpoints in `api/routes/interview.py` (unguessable token in the path, no account; the answers endpoint streams SSE from a sync generator that opens its own `create_session()`, never `Depends(get_db)`), and recruiter endpoints in `api/routes/user_runs.py` — thin wrappers over `interview/service.py`.

  **Interview creation is login-only.** The batch access token grants add-candidates and retry but deliberately *not* interviews: each interview spends Gemini quota through the turn engine, and an anonymous run has no account to attribute or throttle it against. Do not add token-flavored interview routes to `api/routes/batch.py` for symmetry — `batch.py` carries a comment marking their absence as intentional. Note `interview/service.py` itself has no notion of `user_id`; it authorizes by run-membership only, so the boundary is *which resolver fetched the run* (`_load_owned_run` filters on `user_id` in SQL). The anonymous results page shows a locked sign-in upsell instead, via the `interviewLocked` prop.

  `engine.py` is the voice seam: it speaks typed `EngineEvent`s only, no FastAPI imports; the route maps events to SSE frames. **The candidate surface must never expose `question_script`, `grounding`, or a question's `subject`/`good_answer_covers` — those are the rubric.**

  **Spoken answers ride that seam without changing it.** `POST /interviews/{token}/answers-audio` takes a multipart recording, transcribes it in `transcriber.py`, and then calls the same `engine.submit_answer` the typed route calls — the engine has no idea how the text arrived. `transcriber.py` is a plain module, not a provider package: one `build_model()` call site with a mandatory verbatim prompt (without it the model paraphrases into fluent falsehoods), one `transcribe_answer(audio, mime_type)`, and no ABC, because there is exactly one implementation and no env var selecting it. The route, not the engine, carries the two audio-only extras: it enriches the `ack` SSE frame with the transcript (the client didn't author the text, so it can't render the answer bubble without it), and it attaches `audio_path`/`audio_mime_type` to the committed turn via `InterviewRepository.attach_answer_audio` after the stream drains. Recordings are stored through the `core/file_storage.py` façade under `interviews/{interview_id}/` and served back **only** to the recruiter (`GET /evaluations/runs/.../interview/audio/{seq}`, JWT); the candidate surface exposes a `has_audio` flag and never a storage key.

  Each interview snapshots its answer mode onto `interviews.answer_mode` at creation, and `_precheck_answer` gates both routes on it — an audio-mode interview rejects typed answers and vice versa, so the snapshot isn't decorative and there's no silent downgrade to typing when a mic fails. **Known caveat, accepted:** transcription is reliable on ordinary speech but mis-hears rare technical tokens (`nginx`, `JSONB`, `GIN`), sometimes rendering them as fluent, plausible English that gives a reader no signal anything was lost. Measured over ~30 transcriptions of the same clips, and partly speaker-dependent (accent moves the score). The stored recording is the recruiter's recourse. Do not "fix" this by post-processing transcripts or swapping in a bigger model behind a new env var.

  The follow-up cap, gap-probe cap, time limit, invite TTL, recording-duration and byte caps, and the audio MIME allowlist are all constants in `interview/constants.py`, not env vars. Two settings are the exception, both env-driven on `Config` with the same shape — code default is the dev-friendly value, `.env.example` carries the production one: `INTERVIEW_QUESTION_COUNT` / `INTERVIEW_QUESTION_COUNT_TOLERANCE` (so a local checkout runs 1-question test interviews while production asks the full 5-6), and `INTERVIEW_MODE` (`text` locally so no mic or audio quota is needed, `audio` in production).

- **`config.py`** — Environment variable loading. LLM model configured via `MODEL_NAME` (default: `google_genai:gemini-2.5-flash-lite`).

### Frontend (`frontend/`)

**UI components:** Prefer Shadcn UI components when building or modifying UI. Use `pnpm dlx shadcn@latest add <component>` to add new components (they land in `components/ui/`). Fall back to raw Radix UI primitives or Tailwind only when Shadcn doesn't cover the use case.

Next.js App Router. Routes:

| Route | Access | Purpose |
| --- | --- | --- |
| `/` | public | Marketing landing; redirects signed-in users to `/dashboard` |
| `/login`, `/auth/callback` | public | Google sign-in; callback reads `?token=` |
| `/demo` | public | Anonymous submit flow (`components/submit-form.tsx`) |
| `/evaluation?token=` | public | Anonymous batch results |
| `/interview?token=` | public | Candidate takes an AI interview (invite link) |
| `/dashboard`, `/dashboard/new` | auth | Stats + recent runs; new-evaluation wizard |
| `/history`, `/profile` | auth | Past runs; account |
| `/evaluation/[id]` | auth | Owned run detail |

Auth-gated routes live in the `app/(dashboard)/` route group. **There is no `middleware.ts`** — gating is client-side in `components/dashboard-layout.tsx`, which redirects to `/login` when `useAuth()` resolves with no user. `contexts/auth-context.tsx` holds the session; the JWT is stored in `localStorage` and attached by `services/api.ts` on every request.

**Two parallel data models, one shared UI.** `services/batch.ts` covers the anonymous token flow and `services/runs.ts` the authenticated one; they return different shapes. The structural `EvaluationItem` type in `lib/evaluation-types.ts` reconciles them so everything in `components/evaluation/` (results table, breakdown panel, compare bar, resume sheet, stats) serves both pages. When touching results UI, keep it working for both.

The shared components are flow-agnostic on purpose: they never call `useAuth()` or import a service, so flow identity arrives only as props (bound callbacks, or `interviewLocked` for the anonymous page). Interview functions live in `services/runs.ts` only.

**Demo mode is frontend-only** — there is no backend flag or endpoint for it. `NEXT_PUBLIC_DEMO_MODE=true` makes `lib/demo.ts` intercept the batch and auth service calls and serve fixtures from `lib/demo-data/`.

## Configuration

Backend env vars are documented in `backend/.env.example`. Key variables: `GOOGLE_API_KEY` / `GOOGLE_API_KEYS` (comma-separated, rotated round-robin, takes precedence), `DATABASE_URL`, `REDIS_URL`, `MODEL_NAME`, `SECRET_KEY` (JWT + OAuth session), `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, `API_KEY` (empty disables the header check), `EMAIL_PROVIDER` (console|gmail|resend), `INTERVIEW_MODEL_NAME` / `INTERVIEW_GOOGLE_API_KEY` / `INTERVIEW_QUESTION_COUNT` / `INTERVIEW_QUESTION_COUNT_TOLERANCE` / `INTERVIEW_MODE` (text|audio), `USE_S3` + `S3_BUCKET_NAME` / `S3_REGION` / AWS credentials, `BASE_URL`, `FRONTEND_URL`, `LOG_LEVEL`, `LOG_TO_FILE`.

Frontend: `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`), `NEXT_PUBLIC_API_KEY` (optional, must match backend `API_KEY`), `NEXT_PUBLIC_DEMO_MODE`.

## Code Quality

- **Backend:** Ruff for linting/formatting (only `I`/isort rules enabled), MyPy strict mode, `alembic/` excluded from both
- **Frontend:** ESLint with Next.js config, TypeScript strict
- **CI** (`.github/workflows/ci.yml`) runs on pull requests to `main` only: backend `ruff check` + `ruff format --check` + `mypy app`; frontend `pnpm lint`. No build, typecheck, or test step.
- **Git hooks are split:** husky at the repo root runs lint-staged (ESLint) on staged `*.{ts,tsx}`; ruff runs through a separate `pre-commit install` inside `backend/`.

## Deployment

Production runs on a single EC2 host: API, worker, and Redis as Docker Compose services behind nginx, with PostgreSQL on RDS and config rendered from SSM Parameter Store on every deploy. Deploys are manual-dispatch only — the **Deploy to EC2** GitHub Actions workflow sends an SSM command that runs `backend/deploy/deploy.sh` on the host.

Two things a deploy does **not** carry: new env vars (the render pulls from SSM, so a var must be seeded with `make seed-ssm` first or prod silently runs the code default) and nginx config (`backend/deploy/nginx/recruitai.conf` is a reference copy; the live vhost is certbot-managed and edited by hand).

See [backend/deploy/README.md](backend/deploy/README.md) for the full pipeline, config workflow, and TLS caveats.

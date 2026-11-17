# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Recruit AI is an AI-powered resume screening system. Users upload PDF resumes and a job description, and the system scores candidates using Google Gemini (via LangChain). There are two entry paths: signed-in users own their evaluation runs (Google OAuth), and an anonymous token-based batch flow lets anyone submit and get results via an unguessable link plus email notification.

The anonymous flow is a **trial surface**, not a workspace: it is capped at 5 resumes per run (`MAX_ANONYMOUS_RESUMES` in `core/file_upload.py`) and cannot create AI interviews. Both are deliberate — signing in does not carry an anonymous run over, so those users start a fresh evaluation.

## Tech Stack

- **Backend:** Python 3.13+, FastAPI, SQLAlchemy, Celery (Redis broker), Alembic, LangChain + Gemini (OpenAI or any OpenAI-compatible API, e.g. Meta Muse Spark, optional for text calls)
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
cp .env.example .env.local
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
make budget-status    # Today's global LLM budget usage
make budget-reset     # Clear today's budget counter (unblock a demo)
make rate-limit-status              # Budget key + any active cooldowns
make rate-limit-clear KEY=retry:<run-id>   # Release a stuck cooldown
make seed-ssm         # Seed SSM Parameter Store from an env file (prod bootstrap)
make seed-ssm-prune   # List SSM params no longer in the env file (read-only)
make audit-log        # Recent deletions (LIMIT=50)
make audit-run RUN=<run-id>         # One run's deletion history
make batch-start      # CLI batch evaluation (scripts/run_batch.py); also batch-status / batch-results RUN_ID=<id>
```

`make help` lists every target.

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

```bash
make test             # from backend/; needs a local Postgres
```

`backend/tests/` is a small, fixed suite of core invariants: scoring math, the rate limiter, auth and ownership boundaries, the anonymous resume cap, and interview redaction. It uses a real Postgres (a separate `test-recruit-ai` database on `localhost:5432`, created on first run and rolled back per test) and fakeredis, and fails any test that reaches an LLM. There is no frontend test suite.

New features do not add tests unless they change one of those invariants.

## Architecture

### Backend (`backend/app/`)

The backend follows a layered architecture: **routes → services/scorers → repositories → models**.

- **`api/`** — FastAPI routes (`routes/`) and HTTP request/response schemas (`schemas/`). Entry point is `api/main.py` which creates the app via `create_app()`. Route files: `auth.py`, `batch.py`, `user_runs.py`, `admin.py`, `interview.py`, `health.py`. Custom exception handlers in `api/exceptions.py`.

  **Two auth schemes coexist.** JWT Bearer auth is required on `/evaluations/runs/*`, `/dashboard/*`, `/auth/me`, `/admin/*`, and `/health/detailed`. Everything else is authorized by an unguessable token in the URL: the anonymous batch flow (`/batch/status/{token}/*`) and the candidate interview surface (`/interviews/{token}/*`) have no account behind them. Because those tokens are shareable, the anonymous surface is bounded in two ways: uploads are capped via `enforce_anonymous_resume_cap` (called **before** the per-file loop — the loops fold `ValidationError` into a per-file `errors` list, so a cap raised inside one would never reach the client as a 400), and interviews are excluded entirely.

  **`POST /batch/submit` is deliberately unauthenticated.** It is the one endpoint with no token, because it mints one. What bounds it is `enforce_budget` plus the 5-resume anonymous cap, per the one-bucket rationale below — not a credential. **Do not add a shared secret here.** Any credential the browser must send ships to every visitor in the JS bundle, so it would look like a gate without being one; the budget is the real bound.

  The second scheme is `require_admin` (`auth/jwt.py`), which layers on `get_current_active_user` and checks the hand-set `users.is_admin` flag. It guards **the `/admin` router as a whole** (`dependencies=` on the `APIRouter`, not per-handler) so an endpoint added later cannot forget it.

  **The admin surface is read-only, and that is the design.** It adds cross-tenant *reads* only (`UserRepository.list_all/count/count_since`, and a demarcated block at the end of `EvaluationRunRepository`) and **no writes**: no user editing, no deactivation, no deleting other people's runs.
  - **Never add LLM budget or circuit-breaker mutations here.** The overview shows both read-only; resetting stays on `make budget-reset` / `circuit-reset` / `rate-limit-clear`, because a browser button would let an admin JWT un-throttle Gemini spend.
  - `/admin/runs` returns metadata only: never `access_token` (it *is* the anonymous surface's authorization), and no link into run detail (`get_by_id_for_user` filters on `user_id`; an admin is not the owner).
  - Admin is granted by hand (`UPDATE users SET is_admin = true WHERE email = '...'`); no endpoint sets it. No admin handler calls a model, so none call `enforce_budget`.

  `api/exceptions.py` also carries `RateLimitError` (429), and `api/dependencies.py` carries `enforce_budget` / `enforce_cooldown` (the matching `refund` lives in `core/rate_limit.py`). See the `rate_limit.py` notes under `core/`.

  **`GET /health` and `GET /health/detailed` differ on purpose.** `/health` is unauthenticated and dependency-free because the prod container healthcheck polls it. `/detailed` reaches the model, so it is gated on `require_admin`, caches its LLM verdict for 300s, and charges the budget on a cache miss. The admin JWT is the gate; the cache is the second line of defence.

- **`auth/`** — `jwt.py` (HS256 via `joserfc`, 7-day expiry; the `sub` claim is the **Google ID**, not the user UUID) and `oauth.py` (authlib Google OIDC client). `SessionMiddleware` in `api/main.py` is required for OAuth state.

- **`core/`** — `resume_parser.py` (PDF → markdown + structured data via Gemini), `job_description_parser.py` (text → structured requirements, validates input is a real JD), `file_upload.py` (PDF validation), `file_storage.py`, `model_factory.py`, `rate_limit.py`, `redis_client.py`, `logger.py`.

  - `file_storage.py` is a façade over `core/storage/` (`base.py` ABC, `local.py`, `s3.py`), selected by the `USE_S3` env var. Prefer the façade functions over instantiating a backend directly.
  - `model_factory.py`: **all LLM call sites go through `build_model()`**, never `init_chat_model` directly, and **every structured call goes through `invoke_structured(Schema, system_prompt, messages, model_name=..., reasoning_effort=...)`**, never `create_agent` directly.
    - It round-robins across `GOOGLE_API_KEYS` (one pool shared by scoring and interviews, deliberately no interview-specific key) via a Redis `INCR` cursor, so rotation is consistent across Celery processes.
    - The provider comes from the model name: an `openai:` prefix routes to langchain-openai with `OPENAI_API_KEY` at `OPENAI_BASE_URL`, so any OpenAI-compatible API works (Muse Spark: `openai:muse-spark-1.3-contributor` at `https://api.meta.ai/v1`).
    - `invoke_structured` derives model and output strategy from the one `model_name`: `openai:` models get strict json_schema, because Muse Spark 400s on forced `tool_choice` and, without `strict=True`, emits corrupted keys Pydantic silently drops.
    - `reasoning_effort` is sent only when a call site or `OPENAI_REASONING_EFFORT` sets one (non-reasoning models like `gpt-4o` reject it). For Muse: `low` by default, `minimal` for question generation and the live follow-up call (someone waits), and `medium` measured *less* stable on the assessor.
    - Muse is text-only, so transcription (`INTERVIEW_TRANSCRIBE_MODEL_NAME`) and TTS (`INTERVIEW_TTS_MODEL_NAME`) stay on Gemini.
  - `logger.py` configures logging **once per process**: `create_app()` calls `configure_logging()`, and the worker calls it from Celery's `setup_logging` signal (connecting that signal is what stops Celery configuring the root logger itself, and it makes the worker's `--loglevel` flag meaningless, so `LOG_LEVEL` is the only knob). Modules only do `logger = logging.getLogger(__name__)`. Messages are a fixed event name plus `key=value` pairs as `%s` args (`"Item completed: run=%s item=%s"`); use `logger.exception` in `except` blocks for unexpected failures. **Never log names, email addresses (use `mask_email`), resume filenames or storage paths (they end in the filename), or raw URLs on the token surfaces**; log ids and route templates instead. Production logs to stdout only (`LOG_TO_FILE=false`), rotated by the compose `x-logging` anchor.
  - `redis_client.py` provides `get_redis()`, the single Redis client for the process. Use it instead of `Redis.from_url`; four modules used to build their own, and the health check rebuilt one on every request.

- **`rate_limit.py`** (in `core/`) bounds LLM spend. It counts **units of LLM work, not requests**, priced in one cost table, against exactly **one bucket**: a global daily ceiling shared by every caller (no per-user/IP/token buckets, no IPs read anywhere). `enforce_budget(cost)` is an explicit call at the top of each handler, after cheap validation and before any model call or Celery dispatch, so a rejected request costs zero quota. Invariants: `_precheck_answer` in `interview.py` charges **last** so a throttled answer is a real 429, not an SSE `error` frame; and the limiter complements, never replaces, the reactive `worker/circuit_breaker.py`. Full reference: [backend/docs/rate-limiting.md](backend/docs/rate-limiting.md).

  **Anonymous run history was deleted, not hardened.** There is deliberately no endpoint listing batch runs: access tokens *are* that surface's authorization, so listing them to an unidentified caller is a full bypass. If the demo ever needs history, build it from tokens the browser visited, in `localStorage`.

- **`evaluation/`** — Three-component scoring engine orchestrated by `composite_scorer.py`:
  - `skill_scorer.py` (45% weight) — LangChain agent evaluates skill matches. Match types: Exact (1.0), Partial (0.65), None (0.0). Skill tiers weight Critical 0.30 / Required 0.55 / Preferred 0.15, renormalized over the tiers the JD actually has; Critical is additionally a gate — the score is multiplied by `0.5 ** critical_gaps`.
  - `experience_scorer.py` (40% weight) — Evaluates work history relevance and years.
  - `education_scorer.py` (15% weight) — Evaluates degree level and field match. More lenient for tech roles.
  - Weights redistribute dynamically when requirements are missing. Hire signal thresholds: Strong Match (>=0.85), Good Match (0.70-0.84), Partial Match (0.55-0.69), Weak Match (0.40-0.54), No Match (<0.40). See [backend/docs/resume-evaluation.md](backend/docs/resume-evaluation.md) for the full walkthrough.

- **`models/`** — SQLAlchemy ORM models. Tables: `users`, `candidates`, `jobs`, `job_requirements`, `candidate_evaluations`, `evaluation_runs`, `evaluation_run_items`, `interviews`, `interview_turns`, `interview_templates`, `deletion_audits`. `deletion_audits` is written in the same transaction as every run or run-item delete and is deliberately denormalized (the rows it describes are gone); read it with `make audit-log` / `audit-run`. `candidate_evaluations` has a unique constraint on `(candidate_id, job_id)` to support upsert re-evaluation. `EvaluationRun.user_id` and `Job.user_id` are **nullable** — that's how anonymous batch runs coexist with owned ones.

- **`repositories/`** — Data access layer, one module per aggregate. `evaluation_run_repository.py` manages status transitions: draft → pending → processing → completed/failed.

- **`schemas/`** — Domain/LLM Pydantic schemas (scoring output, parsed resumes and JDs). Distinct from `api/schemas/`, which holds HTTP-facing models. Don't conflate the two.

- **`worker/`** — Celery tasks using chord pattern: `process_evaluation_run` (orchestrator) → `evaluate_resume` (parallel per-resume) → `finalize_evaluation_run` (callback, sends email), with `on_chord_error` wired via `link_error`. Includes `circuit_breaker.py` for Gemini rate limit protection — detects quota errors (Gemini `ResourceExhausted`, or a 429 from an `openai:` model), sets a Redis flag to block new tasks, requires manual reset via `make circuit-reset`.

- **`services/`** — `email_service.py` with pluggable providers: `ConsoleProvider` (local dev, logs to stdout), `GmailProvider` (SMTP), `ResendProvider` (API). Set via `EMAIL_PROVIDER`. Templates in `app/templates/emails/`; images in `assets/` are attached inline (CID), not linked. **Interview invites are emailed only on an explicit recruiter click** (`.../interview/send-invite`), never on approve: the address is parsed from the resume and the link alone grants access. Sent synchronously so failures surface; never include script or rubric.

- **`interview/`** — AI interviewer: question generation, the turn engine in `engine.py`, verbatim speech-to-text in `transcriber.py`, text-to-speech in `speaker.py`, the post-interview assessor, and a shared create/detail/reissue service. Its routes are deliberately split two ways: candidate endpoints in `api/routes/interview.py` (unguessable token in the path, no account; the answers endpoint streams SSE from a sync generator that opens its own `create_session()`, never `Depends(get_db)`), and recruiter endpoints in `api/routes/user_runs.py` — thin wrappers over `interview/service.py`. See [backend/docs/ai-interviewer.md](backend/docs/ai-interviewer.md) for the full feature reference (lifecycle, SSE protocol, speech pipeline, assessment structure, config).

  **Interview creation is login-only.** The batch access token grants add-candidates and retry but deliberately *not* interviews: each interview spends Gemini quota through the turn engine, and an anonymous run has no account to attribute or throttle it against. Do not add token-flavored interview routes to `api/routes/batch.py` for symmetry — `batch.py` carries a comment marking their absence as intentional. Note `interview/service.py` itself has no notion of `user_id`; it authorizes by run-membership only, so the boundary is *which resolver fetched the run* (`_load_owned_run` filters on `user_id` in SQL). The anonymous results page shows a locked sign-in upsell instead, via the `interviewLocked` prop.

  **A human approves every interview before a candidate can reach it.** Creation produces a `draft` with **no `access_token`** (nullable column), so it is unreachable by construction; the recruiter edits it (`PATCH .../interview/draft`), and `POST .../interview/approve` mints the token and only then dispatches TTS synthesis. A per-run `interview_templates` row fixes question count, length, follow-ups, and hand-written questions; each interview snapshots what it needs, so template edits only reach later drafts.

  `engine.py` is the voice seam: it speaks typed `EngineEvent`s only, no FastAPI imports; the route maps events to SSE frames. **The candidate surface must never expose `question_script`, `grounding`, or a question's `subject`/`good_answer_covers`: those are the rubric.**

  **Voice rides that seam without changing it.**
  - *Spoken answers:* `POST /interviews/{token}/answers-audio` transcribes in `transcriber.py` (a plain module, one `build_model()` call with a mandatory verbatim prompt, no ABC), then calls the same `engine.submit_answer` the typed route calls. The route attaches the recording to the committed turn after the stream drains.
  - *Spoken questions:* `speaker.py` synthesizes the opening and core questions at approve time (Celery `synthesize_interview_voice`); closings and follow-ups are synthesized lazily. All audio is served via `GET /interviews/{token}/voice/{key}`, which 404s on a key not in the interview's script, so the token surface can't be used to trigger arbitrary synthesis.
  - **The candidate never sees their own transcript** (`build_state_response` nulls a spoken answer's `content`), answers are one take, and recordings are served **only** to the recruiter over JWT; the candidate surface exposes a `has_audio` flag, never a storage key.

  Each interview snapshots `answer_mode` and `voice_mode` at creation; `_precheck_answer` gates both answer routes on the mode, so there's no silent downgrade to typing when a mic fails. **Known caveat, accepted:** transcription mis-hears rare technical tokens (`nginx`, `JSONB`) as fluent English; the stored recording is the recruiter's recourse. Do not "fix" this by post-processing transcripts or a bigger model behind a new env var.

  Caps, time limits, invite TTL, and the audio MIME allowlist are constants in `interview/constants.py`, not env vars. The exceptions are env-driven on `Config`, with the dev-friendly value as code default and the production value in `.env.example`: `INTERVIEW_QUESTION_COUNT` / `INTERVIEW_QUESTION_COUNT_TOLERANCE` (1 locally, 5-6 in prod), `INTERVIEW_MODE` (`text` locally, `audio` in prod), and `INTERVIEW_VOICE` (`off` locally, `on` in prod). See [backend/docs/ai-interviewer.md](backend/docs/ai-interviewer.md).

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
| `/admin`, `/admin/runs`, `/admin/llm` | admin | Cross-tenant stats + user list; all runs across accounts; LLM calls/tokens/cost from LangSmith |

Auth-gated routes live in the `app/(dashboard)/` route group. **There is no `middleware.ts`** — gating is client-side in `components/dashboard-layout.tsx`, which redirects to `/login` when `useAuth()` resolves with no user.

The admin pages sit inside that same group, so they inherit that gate, plus `app/(dashboard)/admin/layout.tsx` bounces non-admins to `/dashboard` and `components/app-sidebar.tsx` renders the Admin group only when `user.is_admin`. **Both are convenience, not authorization** — hiding a nav item and redirecting a route protect nothing; `require_admin` on the backend answers every `/admin/*` request with 403. `is_admin` is on `UserResponse` purely so the sidebar can decide what to draw. `contexts/auth-context.tsx` holds the session; the JWT is stored in `localStorage` and attached by `services/api.ts` on every request.

`services/api.ts` funnels every non-2xx into `ApiError(message, status, retryAfter?)`, and callers render `err.message` directly, so backend `detail` strings are user-facing copy. `retryAfter` is populated from a 429's body (not the header, which CORS hides by default). The interview page skips its state refetch on a 429: nothing changed server-side, and the draft is preserved because it is only cleared on `ack`.

**Two parallel data models, one shared UI.** `services/batch.ts` covers the anonymous token flow and `services/runs.ts` the authenticated one; they return different shapes. The structural `EvaluationItem` type in `lib/evaluation-types.ts` reconciles them so everything in `components/evaluation/` (results table, breakdown panel, compare bar, resume sheet, stats) serves both pages. When touching results UI, keep it working for both.

The shared components are flow-agnostic on purpose: they never call `useAuth()` or import a service, so flow identity arrives only as props (bound callbacks, or `interviewLocked` for the anonymous page). Interview functions live in `services/runs.ts` only.

**Demo mode is frontend-only** — there is no backend flag or endpoint for it. `NEXT_PUBLIC_DEMO_MODE=true` makes `lib/demo.ts` intercept the batch and auth service calls and serve fixtures from `lib/demo-data/`.

## Configuration

Backend env vars are documented in `backend/.env.example`. Key variables: `GOOGLE_API_KEY` / `GOOGLE_API_KEYS` (comma-separated, rotated round-robin, takes precedence), `DATABASE_URL`, `REDIS_URL`, `MODEL_NAME`, `SECRET_KEY` (JWT + OAuth session), `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, `EMAIL_PROVIDER` (console|gmail|resend), `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_REASONING_EFFORT` (for `openai:` model names), `INTERVIEW_MODEL_NAME` / `INTERVIEW_TRANSCRIBE_MODEL_NAME` / `INTERVIEW_TTS_MODEL_NAME` / `INTERVIEW_QUESTION_COUNT` / `INTERVIEW_QUESTION_COUNT_TOLERANCE` / `INTERVIEW_MODE` (text|audio) / `INTERVIEW_VOICE` (on|off), `USE_S3` + `S3_BUCKET_NAME` / `S3_REGION` / AWS credentials, `BASE_URL`, `FRONTEND_URL`, `LOG_LEVEL`, `LOG_TO_FILE`, `RATE_LIMIT_ENABLED` (on|log|off) / `RATE_LIMIT_DAILY_GLOBAL_UNITS`.

**Rate limiting is only two env vars**, and both **default to their production values in code** (unlike the `INTERVIEW_*` settings above): those are cost *reducers*, these are cost *guards* where an unseeded deploy would be silently unprotected. Set `RATE_LIMIT_ENABLED=off` in a local `.env` if the limits get in the way. `RATE_LIMIT_DAILY_GLOBAL_UNITS` defaults to **100**, roughly 16 anonymous trial runs a day: **raise it before demoing to an audience**. See [backend/docs/rate-limiting.md](backend/docs/rate-limiting.md#7-configuration).

**LLM tracing is LangSmith's built-in LangChain tracing**, configured purely by `LANGSMITH_*` env vars that LangChain reads directly (not `Config`). Per-call tokens, latency, errors, and cost live there, not in the app. `LANGSMITH_HIDE_INPUTS` / `LANGSMITH_HIDE_OUTPUTS` must be `true` in production: inputs are resumes, candidate answers, and interview audio. Token counts survive hiding because the tracer copies usage into run metadata, so never set `LANGSMITH_HIDE_METADATA`. `celery_app.py` flushes pending traces on worker shutdown. `GET /admin/llm-usage` (`core/llm_usage.py`) reads it back for `/admin/llm` with one paginated `list_runs` scan of numeric fields only, cached 5 minutes (not `/runs/stats`, which 429s on the second call).

Frontend: `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`), `NEXT_PUBLIC_DEMO_MODE`.

## Code Quality

- **Backend:** Ruff for linting/formatting (`I` isort, plus `G`/`LOG` so f-string log calls fail lint), MyPy strict mode, `alembic/` excluded from both
- **Frontend:** ESLint with Next.js config, TypeScript strict
- **CI** (`.github/workflows/ci.yml`) runs on pull requests to `main` only: backend `ruff check` + `ruff format --check` + `mypy app`, plus `pytest` against a Postgres service container; frontend `pnpm lint` + `pnpm typecheck`. No build step.
- **Git hooks are split:** husky at the repo root runs lint-staged (ESLint) on staged `*.{ts,tsx}`; ruff runs through a separate `pre-commit install` inside `backend/`.

## Deployment

Production runs on a single EC2 host: API, worker, and Redis as Docker Compose services behind nginx, with PostgreSQL on RDS and config rendered from SSM Parameter Store on every deploy. Deploys are manual-dispatch only — the **Deploy to EC2** GitHub Actions workflow sends an SSM command that runs `backend/deploy/deploy.sh` on the host.

Two things a deploy does **not** carry: new env vars (the render pulls from SSM, so a var must be seeded with `make seed-ssm` first or prod silently runs the code default) and nginx config (`backend/deploy/nginx/recruitai.conf` is a reference copy; the live vhost is certbot-managed and edited by hand).

Retiring a var is one-way too: the render has no allowlist, so a parameter dropped from the code keeps reappearing in `.env.prod` until it is deleted from SSM. `make seed-ssm-prune` lists the leftovers; `seed_ssm_params.py --prune` deletes them, always prompting, with deliberately no `--yes` flag so it cannot be scripted.

See [backend/deploy/README.md](backend/deploy/README.md) for the full pipeline, config workflow, and TLS caveats.

# Recruit AI: Backend

FastAPI API and Celery worker. Needs PostgreSQL 16 and Redis 7.

## Getting Started

1. **Install dependencies** with [`uv`](https://docs.astral.sh/uv/):

   ```bash
   uv sync
   ```

2. **Configure environment variables:**

   ```bash
   cp .env.example .env
   ```

   At minimum set `GOOGLE_API_KEY`, and point `DATABASE_URL` and `REDIS_URL` at your PostgreSQL and Redis instances. Every variable is documented in `.env.example`.

3. **Run database migrations:**

   ```bash
   make migrate
   ```

## Run the Application

### Option 1: Local Development

```bash
make worker  # Celery worker for background evaluation
make dev     # FastAPI server with hot reload
```

### Option 2: Docker

```bash
docker compose up  # PostgreSQL, Redis, API, and worker
```

- API: http://localhost:8000
- Interactive API docs: http://localhost:8000/docs

Run `make help` for the full list of commands (linting, formatting, budget and circuit-breaker operations).

## Tests

```bash
make test
```

## Infrastructure

- **EC2:** API, Celery worker, and Redis as Docker Compose services behind nginx
- **RDS:** PostgreSQL
- **S3:** resume and interview audio storage
- **SSM Parameter Store:** production config, rendered on each deploy

Deploys run from the **Deploy to EC2** GitHub Actions workflow. See [`deploy/README.md`](deploy/README.md).

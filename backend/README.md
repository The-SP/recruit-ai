## Getting Started

1. Clone the repository
2. Set up environment variables in `.env`:

   - Create a `.env` file in the `backend/` directory using `.env.example` as a template
   - Configure your API keys, email configs and database connection

3. **Install dependencies:**

   - Using `uv` (recommended)

     ```bash
     uv sync
     ```

   - Using `pip`
     ```bash
     python -m venv .venv
     source .venv/bin/activate
     pip install -e .
     ```

4. **Set up the database:**
   ```bash
   make migrate  # Run database migrations
   ```

## Run the Application

### Option 1: Local Development

Start the required services:

```bash
make worker  # Start Celery worker for background tasks
make dev     # Start FastAPI server
```

### Option 2: Docker

```bash
docker compose up
```

- The API will be accessible at http://localhost:8000
- Interactive API docs: http://localhost:8000/docs

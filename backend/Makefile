.PHONY: help worker flower batch-start

help:  ## Show this help
	@echo "Available commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

worker:  ## Start Celery worker
	uv run celery -A app.worker.celery_app worker --loglevel=info --concurrency=2

flower:  ## Start Flower monitoring
	uv run celery -A app.worker.celery_app flower

batch-start:  ## Start batch evaluation
	@echo "Starting batch evaluation..."
	uv run -m scripts.run_batch start

batch-status:  ## Check status (usage: make batch-status RUN_ID=<id>)
	@if [ -z "$(RUN_ID)" ]; then \
		echo "Error: RUN_ID required. Usage: make batch-status RUN_ID=<uuid>"; \
		exit 1; \
	fi
	@echo "Checking status for run: $(RUN_ID)"
	uv run -m scripts.run_batch status $(RUN_ID)

batch-results:  ## Check results (usage: make batch-results RUN_ID=<id>)
	@if [ -z "$(RUN_ID)" ]; then \
		echo "Error: RUN_ID required. Usage: make batch-results RUN_ID=<uuid>"; \
		exit 1; \
	fi
	@echo "Checking results for run: $(RUN_ID)"
	uv run -m scripts.run_batch results $(RUN_ID)

circuit-status:  ## Check circuit breaker status
	@uv run -m scripts.circuit_breaker status

circuit-reset:  ## Reset circuit breaker manually
	@uv run -m scripts.circuit_breaker reset

lint:  ## Lint code
	@echo "Running linter..."
	uv run ruff check .
	@echo "✓ Lint passed"

format:  ## Format code
	@echo "Formatting code..."
	uv run ruff format .
	@echo "✓ Formatted"

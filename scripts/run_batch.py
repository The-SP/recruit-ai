"""
Example usage of the batch evaluation system.

To run a batch evaluation:
1. Start Redis: redis-server
2. Start Celery worker: uv run celery -A app.worker.celery_app worker --loglevel=info
   - Default: runs CPU count tasks in parallel
   - Sequential: add --concurrency=1 for one task at a time
3. Run this script: uv run -m scripts.run_batch
"""

from uuid import UUID

from app.models.database import create_session
from app.repositories.evaluation_run_repository import EvaluationRunRepository
from app.worker.tasks import start_evaluation_run

# Configuration
JOB_ID = "cf6c7877-389f-426f-a4cb-7c1b7be36f1f"  # Existing job UUID
RESUME_FOLDER = "data/resumes"  # Folder containing PDF resumes


def start_batch():
    """Start a batch evaluation run"""
    print(f"Starting evaluation run for job={JOB_ID}")
    print(f"Resume folder: {RESUME_FOLDER}")

    # Dispatch the task (returns immediately)
    result = start_evaluation_run.delay(JOB_ID, RESUME_FOLDER)

    # Wait for orchestrator to complete and get run_id
    run_id = result.get(timeout=60)
    print(f"Evaluation run created: {run_id}")

    return run_id


def check_status(run_id: str):
    """Check status of an evaluation run"""
    db = create_session()
    try:
        repo = EvaluationRunRepository(db)
        run = repo.get_by_id(UUID(run_id), with_items=True)

        if not run:
            print(f"Run not found: {run_id}")
            return

        print(f"\n{'=' * 50}")
        print(f"Run ID: {run.id}")
        print(f"Status: {run.status}")
        print(f"Progress: {run.processed_count}/{run.total_count}")
        print(f"Failed: {run.failed_count}")

        if run.processing_time_seconds:
            print(f"Processing time: {run.processing_time_seconds:.2f}s")

        print(f"\n{'=' * 50}")
        print("Items:")
        for item in run.items:
            status_icon = {
                "completed": "✓",
                "failed": "✗",
                "processing": "⟳",
                "pending": "○",
            }.get(item.status, "?")

            line = f"  {status_icon} {item.pdf_filename} [{item.status}]"
            if item.processing_time_seconds:
                line += f" ({item.processing_time_seconds:.1f}s)"
            if item.error_message:
                line += f" - {item.error_message[:50]}"
            print(line)

    finally:
        db.close()


def get_results(run_id: str):
    """Get ranked results from a completed run"""
    db = create_session()
    try:
        repo = EvaluationRunRepository(db)
        run = repo.get_by_id(UUID(run_id), with_items=True)

        if not run:
            print(f"Run not found: {run_id}")
            return

        if run.status != "completed":
            print(f"Run not completed yet. Status: {run.status}")
            return

        # Collect completed items with their evaluations
        results = []
        for item in run.items:
            if item.status == "completed" and item.evaluation:
                results.append(
                    {
                        "filename": item.pdf_filename,
                        "candidate_id": item.candidate_id,
                        "score": item.evaluation.final_score,
                        "signal": item.evaluation.hire_signal,
                    }
                )

        # Sort by score descending
        results.sort(key=lambda x: x["score"] or 0, reverse=True)

        print(f"\n{'=' * 50}")
        print("RANKED RESULTS")
        print(f"{'=' * 50}")

        for i, r in enumerate(results, 1):
            score = f"{r['score']:.3f}" if r["score"] else "N/A"
            print(f"{i}. {r['filename']}")
            print(f"   Score: {score} | Signal: {r['signal']}")
            print()

    finally:
        db.close()


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage:")
        print("  uv run -m scripts.run_batch start")
        print("  uv run -m scripts.run_batch status <run_id>")
        print("  uv run -m scripts.run_batch results <run_id>")
        sys.exit(1)

    command = sys.argv[1]

    if command == "start":
        start_batch()
    elif command == "status" and len(sys.argv) > 2:
        check_status(sys.argv[2])
    elif command == "results" and len(sys.argv) > 2:
        get_results(sys.argv[2])
    else:
        print(f"Unknown command: {command}")

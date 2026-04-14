"""
Example usage of the batch evaluation system.

To run a batch evaluation:
1. Start Redis: redis-server
2. Start Celery worker: uv run celery -A app.worker.celery_app worker --loglevel=info
   - Default: runs CPU count tasks in parallel
   - Sequential: add --concurrency=1 for one task at a time
3. Run this script: uv run -m scripts.run_batch
"""

import math
import os
import shutil
from uuid import UUID

from app.models.database import create_session
from app.repositories.evaluation_run_repository import (
    EvaluationRunItemRepository,
    EvaluationRunRepository,
)
from app.repositories.job_repository import JobRepository
from app.worker.tasks import process_evaluation_run

# Configuration
JOB_ID = "cf6c7877-389f-426f-a4cb-7c1b7be36f1f"  # Existing job UUID
RESUME_FOLDER = "data/resumes"  # Folder containing PDF resumes


def create_batch_from_folder(job_id: str, folder_path: str) -> str:
    """
    Create a batch run by scanning a folder for PDFs.
    Mimics the API flow: create draft -> add files -> start.
    """
    db = create_session()
    try:
        # Validate job exists
        job_repo = JobRepository(db)
        job = job_repo.get_by_id(UUID(job_id), with_requirements=True)
        if not job:
            raise ValueError(f"Job not found: {job_id}")

        # Create draft run
        run_repo = EvaluationRunRepository(db)
        run = run_repo.create_draft(UUID(job_id))
        print(f"✓ Created batch run: {run.id}")

        # Scan folder for PDFs
        item_repo = EvaluationRunItemRepository(db)
        pdf_files = [f for f in os.listdir(folder_path) if f.lower().endswith(".pdf")]

        if not pdf_files:
            raise ValueError(f"No PDF files found in: {folder_path}")

        # Copy files to batch folder and create items
        for filename in pdf_files:
            src_path = os.path.join(folder_path, filename)
            dst_path = os.path.join(run.folder_path, filename)

            # Copy file to batch folder
            shutil.copy(src_path, dst_path)

            # Get file size in KB
            file_size = math.ceil(os.path.getsize(src_path) / 1024)

            # Create item record
            item_repo.create_uploaded(run.id, filename, file_size)
            run_repo.adjust_total_count(run.id)
            print(f"  + Added: {filename} ({file_size} KB)")

        # Transition to pending
        item_repo.mark_uploaded_as_pending(run.id)
        run_repo.mark_pending(run.id)
        print(f"✓ Batch ready with {run.total_count} files")

        return str(run.id)

    finally:
        db.close()


def start_batch(run_id: str):
    """Dispatch Celery task to process the batch."""
    print(f"Starting batch processing: {run_id}")
    process_evaluation_run.delay(run_id)
    print(f"✓ Task dispatched")


def check_status(run_id: str):
    """Check status of an evaluation run."""
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
                "uploaded": "↑",
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
    """Get ranked results from a completed run."""
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
        run_id = create_batch_from_folder(JOB_ID, RESUME_FOLDER)
        start_batch(run_id)
    elif command == "status" and len(sys.argv) > 2:
        check_status(sys.argv[2])
    elif command == "results" and len(sys.argv) > 2:
        get_results(sys.argv[2])
    else:
        print(f"Unknown command: {command}")

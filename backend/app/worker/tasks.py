import os
from uuid import UUID

from celery import chord, group
from redis import Redis

from app.config import Config
from app.core.logger import init_logger
from app.core.resume_parser import parse_resume
from app.evaluation.composite_scorer import calculate_composite_score
from app.models.database import create_session
from app.models.evaluation_run import ItemStatus, RunStatus
from app.repositories.candidate_repository import CandidateRepository
from app.repositories.evaluation_repository import EvaluationRepository
from app.repositories.evaluation_run_repository import (
    EvaluationRunItemRepository,
    EvaluationRunRepository,
)
from app.repositories.job_repository import JobRepository
from app.schemas.job_description import JobDescriptionResponse
from app.schemas.job_utils import build_job_requirements_schema
from app.worker.celery_app import celery_app, get_failed_key, get_progress_key
from app.worker.circuit_breaker import (
    handle_circuit_breaker_skip,
    handle_rate_limit_failure,
    is_circuit_breaker_active,
    is_rate_limit_error,
)

logger = init_logger(__name__)

redis_client = Redis.from_url(Config.REDIS_URL)

# Key expiration (24 hours)
KEY_EXPIRATION = 86400


def _job_model_to_response(job) -> JobDescriptionResponse:
    """Convert Job model to JobDescriptionResponse schema."""
    requirements = build_job_requirements_schema(job.requirements)

    return JobDescriptionResponse(
        is_job_description=job.is_valid_jd or False,
        document_type=job.document_type,
        job_title=job.title,
        company_name=job.company_name,
        summary=job.summary,
        responsibilities=job.responsibilities,
        requirements=requirements,
        keywords=job.keywords,
    )


@celery_app.task(bind=True, name="process_evaluation_run")
def process_evaluation_run(self, run_id: str) -> str:
    """
    Orchestrator task: Dispatches worker tasks for an existing evaluation run.

    Run and items are already created via API. This task:
    1. Validates run exists and is in pending state
    2. Fetches job and serializes JD
    3. Dispatches chord of evaluate tasks

    Args:
        run_id: UUID of the EvaluationRun

    Returns:
        run_id as string
    """
    logger.info(f"Processing evaluation run: {run_id}")

    if is_circuit_breaker_active():
        error_msg = (
            "Cannot process run - rate limit circuit breaker is active. "
            "Run 'make circuit-reset' to clear."
        )
        logger.error(error_msg)
        raise ValueError(error_msg)

    db = create_session()
    item_ids = []
    jd_dict = {}

    try:
        run_repo = EvaluationRunRepository(db)
        run = run_repo.get_by_id(UUID(run_id), with_items=True)

        if not run:
            raise ValueError(f"Evaluation run not found: {run_id}")

        if run.status != RunStatus.PENDING.value:
            raise ValueError(
                f"Run is not in pending state: {run.status}. Cannot process."
            )

        # Fetch and serialize job description
        job_repo = JobRepository(db)
        job = job_repo.get_by_id(run.job_id, with_requirements=True)
        if not job:
            raise ValueError(f"Job not found: {run.job_id}")

        jd = _job_model_to_response(job)
        jd_dict = jd.model_dump()

        # Get pending item IDs
        item_ids = [
            str(item.id)
            for item in run.items
            if item.status == ItemStatus.PENDING.value
        ]

        if not item_ids:
            raise ValueError(f"No pending items found for run: {run_id}")

        logger.info(f"Found {len(item_ids)} pending items for run={run_id}")

        # Initialize Redis counters
        redis_client.set(get_progress_key(run_id), 0, ex=KEY_EXPIRATION)
        redis_client.set(get_failed_key(run_id), 0, ex=KEY_EXPIRATION)

        # Mark run as processing
        run_repo.mark_started(UUID(run_id))

    finally:
        db.close()

    # Dispatch chord: group of evaluate tasks -> finalize callback
    workflow = chord(
        group(evaluate_resume.s(item_id, jd_dict) for item_id in item_ids),
        finalize_evaluation_run.s(run_id),
    )

    try:
        workflow.apply_async()
    except Exception as e:
        logger.error(f"Failed to dispatch tasks for run={run_id}: {e}")
        db = create_session()
        try:
            run_repo = EvaluationRunRepository(db)
            run_repo.mark_failed(UUID(run_id), str(e))
        finally:
            db.close()
        raise

    logger.info(f"Dispatched {len(item_ids)} tasks for run={run_id}")
    return run_id


@celery_app.task(bind=True, name="evaluate_resume")
def evaluate_resume(self, item_id: str, jd_dict: dict) -> dict:
    """
    Worker task: Process a single resume.

    Args:
        item_id: UUID of the EvaluationRunItem
        jd_dict: Serialized JobDescriptionResponse

    Returns:
        dict with status and optional error
    """
    logger.info(f"Processing item={item_id}")

    if is_circuit_breaker_active():
        handle_circuit_breaker_skip(UUID(item_id))
        return {"status": "failed", "item_id": item_id, "error": "Rate limit active"}

    db = create_session()
    run_id = None

    try:
        item_repo = EvaluationRunItemRepository(db)
        item = item_repo.get_with_run(UUID(item_id))

        if not item:
            raise ValueError(f"Item not found: {item_id}")

        run = item.evaluation_run
        run_id = str(run.id)

        # Mark item as processing
        item_repo.mark_started(item.id)

        # Build full PDF path
        pdf_path = os.path.join(run.folder_path, item.pdf_filename)

        # Parse resume
        logger.info(f"Parsing resume: {pdf_path}")
        resume = parse_resume(pdf_path)

        if not resume.is_resume or not resume.markdown_content:
            raise ValueError(f"Invalid resume or parsing failed: {item.pdf_filename}")

        # Create candidate record
        candidate_repo = CandidateRepository(db)
        candidate = candidate_repo.create(
            resume=resume,
            filename=item.pdf_filename,
            filepath=pdf_path,
        )

        # Deserialize job description
        jd = JobDescriptionResponse.model_validate(jd_dict)

        # Calculate composite score
        logger.info(f"Scoring candidate={candidate.id} against job={run.job_id}")
        result = calculate_composite_score(
            jd=jd, resume_markdown=resume.markdown_content
        )

        # Store evaluation
        eval_repo = EvaluationRepository(db)
        evaluation = eval_repo.create(candidate.id, run.job_id, result)

        # Mark item completed
        item_repo.mark_completed(
            item_id=item.id,
            candidate_id=candidate.id,
            evaluation_id=evaluation.id,
        )

        # Increment success counter
        redis_client.incr(get_progress_key(run_id))

        logger.info(
            f"✓ Completed item={item_id}: candidate={candidate.id}, score={result.final_score}"
        )

        return {"status": "completed", "item_id": item_id}

    except Exception as e:
        if run_id and is_rate_limit_error(e):
            handle_rate_limit_failure(UUID(item_id), UUID(run_id), e, db)
            return {
                "status": "failed",
                "item_id": item_id,
                "error": "Rate limit exceeded",
            }

        # Handle other errors (non-rate-limit)
        error_str = str(e)
        logger.error(f"✗ Failed item={item_id}: {error_str}")

        try:
            item_repo = EvaluationRunItemRepository(db)
            item = item_repo.get_by_id(UUID(item_id))
            if item:
                item_repo.mark_failed(item.id, error_str[:500])
                run_id = str(item.evaluation_run_id)
                redis_client.incr(get_failed_key(run_id))
        except Exception as inner_e:
            logger.error(f"Failed to mark item as failed: {inner_e}")

        return {"status": "failed", "item_id": item_id, "error": error_str[:200]}

    finally:
        db.close()


@celery_app.task(bind=True, name="finalize_evaluation_run")
def finalize_evaluation_run(self, results: list[dict], run_id: str) -> dict:
    """
    Callback task: Finalize the evaluation run after all items complete.

    Args:
        results: List of results from evaluate_resume tasks
        run_id: UUID of the EvaluationRun

    Returns:
        Summary dict
    """
    logger.info(f"Finalizing run={run_id}")

    # Get final counts from Redis
    processed_raw = redis_client.get(get_progress_key(run_id))
    failed_raw = redis_client.get(get_failed_key(run_id))

    processed = (
        int(processed_raw) if isinstance(processed_raw, (int, bytes, str)) else 0
    )
    failed = int(failed_raw) if isinstance(failed_raw, (int, bytes, str)) else 0

    db = create_session()
    try:
        run_repo = EvaluationRunRepository(db)
        run = run_repo.get_by_id(UUID(run_id))

        # Only mark as completed if not already marked as failed
        if run and run.status != "failed":
            run_repo.mark_completed(
                run_id=UUID(run_id),
                processed_count=processed,
                failed_count=failed,
            )
        else:
            logger.info("Run already marked as failed, skipping completion")
    finally:
        db.close()

    # Clean up Redis keys
    redis_client.delete(get_progress_key(run_id))
    redis_client.delete(get_failed_key(run_id))

    summary = {
        "run_id": run_id,
        "status": "completed",
        "processed_count": processed,
        "failed_count": failed,
    }

    logger.info(f"✓ Finalized run={run_id}: {summary}")
    return summary

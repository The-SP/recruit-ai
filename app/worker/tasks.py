import os
from pathlib import Path
from uuid import UUID

from celery import chord, group
from redis import Redis

from app.config import Config
from app.core.logger import init_logger
from app.core.resume_parser import parse_resume
from app.evaluation.composite_scorer import calculate_composite_score
from app.models.database import create_session
from app.repositories.candidate_repository import CandidateRepository
from app.repositories.evaluation_repository import EvaluationRepository
from app.repositories.evaluation_run_repository import (
    EvaluationRunItemRepository,
    EvaluationRunRepository,
)
from app.repositories.job_repository import JobRepository
from app.schemas.job_description import (
    EducationRequirement,
    ExperienceRequirement,
    JobDescriptionResponse,
    JobRequirementsSchema,
    SkillGroup,
    SkillRequirements,
)
from app.worker.celery_app import celery_app, get_failed_key, get_progress_key

logger = init_logger(__name__)

redis_client = Redis.from_url(Config.REDIS_URL)

# Key expiration (24 hours)
KEY_EXPIRATION = 86400


def _job_model_to_response(job) -> JobDescriptionResponse:
    """Convert Job model to JobDescriptionResponse schema"""
    requirements = None
    if job.requirements:
        req = job.requirements
        skills = None
        if req.skills:
            skills = SkillRequirements(
                critical=[SkillGroup(**g) for g in req.skills.get("critical", [])],
                required=[SkillGroup(**g) for g in req.skills.get("required", [])],
                preferred=[SkillGroup(**g) for g in req.skills.get("preferred", [])],
            )
        requirements = JobRequirementsSchema(
            experience=ExperienceRequirement(
                min_years=req.exp_min_years,
                max_years=req.exp_max_years,
                level=req.exp_level,
                key_skills=req.exp_key_skills,
                key_responsibilities=req.exp_key_responsibilities,
            )
            if req.exp_min_years or req.exp_level
            else None,
            education=EducationRequirement(
                min_degree=req.edu_min_degree,
                preferred_fields=req.edu_preferred_fields,
                required=req.edu_required,
            )
            if req.edu_min_degree
            else None,
            skills=skills,
            certifications=req.certifications,
            other_requirements=req.other_requirements,
        )

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


@celery_app.task(bind=True, name="start_evaluation_run")
def start_evaluation_run(self, job_id: str, folder_path: str) -> str:
    """
    Orchestrator task: Creates evaluation run and dispatches worker tasks.

    Args:
        job_id: UUID of the job to evaluate against
        folder_path: Path to folder containing resume PDFs

    Returns:
        evaluation_run_id as string
    """
    logger.info(f"Starting evaluation run for job={job_id}, folder={folder_path}")

    db = create_session()
    try:
        # Validate job exists
        job_repo = JobRepository(db)
        job = job_repo.get_by_id(UUID(job_id), with_requirements=True)
        if not job:
            raise ValueError(f"Job not found: {job_id}")

        # Scan folder for PDFs
        folder = Path(folder_path)
        if not folder.exists():
            raise ValueError(f"Folder not found: {folder_path}")

        pdf_files = sorted([f.name for f in folder.glob("*.pdf")])
        if not pdf_files:
            raise ValueError(f"No PDF files found in: {folder_path}")

        logger.info(f"Found {len(pdf_files)} PDF files")

        # Create evaluation run with items
        run_repo = EvaluationRunRepository(db)
        run = run_repo.create(
            job_id=UUID(job_id),
            folder_path=folder_path,
            filenames=pdf_files,
        )
        run_id = str(run.id)

        # Initialize Redis counters
        redis_client.set(get_progress_key(run_id), 0, ex=KEY_EXPIRATION)
        redis_client.set(get_failed_key(run_id), 0, ex=KEY_EXPIRATION)

        # Mark run as started
        run_repo.mark_started(run.id)

        # Get item IDs for task dispatch
        item_ids = [str(item.id) for item in run.items]

    finally:
        db.close()

    # Dispatch chord: group of evaluate tasks -> finalize callback
    workflow = chord(
        group(evaluate_resume.s(item_id) for item_id in item_ids),
        finalize_evaluation_run.s(run_id),
    )
    workflow.apply_async()

    logger.info(f"Dispatched {len(item_ids)} tasks for run={run_id}")
    return run_id


@celery_app.task(
    bind=True,
    name="evaluate_resume",
    autoretry_for=(Exception,),
    retry_kwargs={"max_retries": 3},
    retry_backoff=True,
    retry_backoff_max=30,
)
def evaluate_resume(self, item_id: str) -> dict:
    """
    Worker task: Process a single resume.

    Args:
        item_id: UUID of the EvaluationRunItem

    Returns:
        dict with status and optional error
    """
    logger.info(f"Processing item={item_id}")

    db = create_session()
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

        # Load job description
        job_repo = JobRepository(db)
        job = job_repo.get_by_id(run.job_id, with_requirements=True)
        if not job:
            raise ValueError(f"Job not found: {run.job_id}")

        jd = _job_model_to_response(job)

        # Calculate composite score
        logger.info(f"Scoring candidate={candidate.id} against job={job.id}")
        result = calculate_composite_score(
            jd=jd, resume_markdown=resume.markdown_content
        )

        # Store evaluation
        eval_repo = EvaluationRepository(db)
        evaluation = eval_repo.create(candidate.id, job.id, result)

        # Mark item completed
        item_repo.mark_completed(
            item_id=item.id,
            candidate_id=candidate.id,
            evaluation_id=evaluation.id,
        )

        # Increment success counter
        redis_client.incr(get_progress_key(run_id))

        logger.info(
            f"Completed item={item_id}: candidate={candidate.id}, score={result.final_score}"
        )

        return {"status": "completed", "item_id": item_id}

    except Exception as e:
        logger.error(f"Failed item={item_id}: {e}")

        # Mark item failed
        try:
            item_repo = EvaluationRunItemRepository(db)
            item = item_repo.get_by_id(UUID(item_id))
            if item:
                item_repo.mark_failed(item.id, str(e))
                run_id = str(item.evaluation_run_id)
                redis_client.incr(get_failed_key(run_id))
        except Exception as inner_e:
            logger.error(f"Failed to mark item as failed: {inner_e}")

        # Don't re-raise if max retries exceeded - let batch continue
        if self.request.retries >= self.max_retries:
            return {"status": "failed", "item_id": item_id, "error": str(e)}
        raise

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
        run_repo.mark_completed(
            run_id=UUID(run_id),
            processed_count=processed,
            failed_count=failed,
        )
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

    logger.info(f"Finalized run={run_id}: {summary}")
    return summary

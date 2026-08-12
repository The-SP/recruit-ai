from uuid import UUID

from fastapi import APIRouter, Depends, Form, UploadFile
from pydantic import EmailStr
from sqlalchemy.orm import Session

from app.api.dependencies import enforce_budget, enforce_cooldown, get_db
from app.api.exceptions import NotFoundError, ValidationError
from app.api.schemas.public import (
    AddCandidatesResponse,
    BatchStatusResponse,
    CandidateBreakdownResponse,
    CandidateResult,
    CreateBatchResponse,
    JobSummary,
    ProgressInfo,
    RetryFailedResponse,
)
from app.core.file_storage import (
    delete_file,
    resolve_file_path,
    save_uploaded_file,
)
from app.core.file_upload import (
    enforce_anonymous_resume_cap,
    read_pdf_content,
    validate_pdf_filename,
)
from app.core.job_description_parser import parse_job_description
from app.core.rate_limit import COST_JD_PARSE, COST_RESUME, refund
from app.models.evaluation_run import RunStatus
from app.repositories.candidate_repository import CandidateRepository
from app.repositories.evaluation_repository import EvaluationRepository
from app.repositories.evaluation_run_repository import (
    EvaluationRunItemRepository,
    EvaluationRunRepository,
)
from app.repositories.job_repository import JobRepository
from app.schemas.education_evaluation import EducationScoreResult
from app.schemas.experience_evaluation import ExperienceScoreResult
from app.schemas.skill_evaluation import SkillScoreResult
from app.worker.tasks import process_evaluation_run

router = APIRouter(prefix="/batch", tags=["batch"])

_RETRY_COOLDOWN_MESSAGE = (
    "This batch was retried a moment ago. Give the current attempt time to "
    "finish before retrying again."
)


# =============================================================================
# Simplified Public API
# =============================================================================


@router.post("/submit", response_model=CreateBatchResponse, status_code=201)
async def submit_batch(
    job_text: str = Form(...),
    email: EmailStr = Form(...),
    files: list[UploadFile] = [],
    db: Session = Depends(get_db),
) -> CreateBatchResponse:
    """
    Submit a batch evaluation with job description and resume PDFs.

    This is a simplified all-in-one endpoint that:
    1. Parses and validates the job description
    2. Creates a job record
    3. Creates a batch run with access token
    4. Uploads and validates PDF files
    5. Starts background processing
    6. Sends notification email

    Returns an access token for viewing results.
    """
    if not files:
        raise ValidationError("At least one PDF file is required")

    enforce_anonymous_resume_cap(0, len(files))

    # Charged before the JD parse below, which is itself an LLM call: a
    # throttled caller must not get a free model invocation on the way to a
    # 429. Same ordering rule as the cap above.
    cost = COST_JD_PARSE + len(files) * COST_RESUME
    enforce_budget(cost)

    # Parse job description
    jd = parse_job_description(job_text)
    if not jd.is_job_description:
        raise ValidationError(
            f"Invalid job description. Detected: {jd.document_type or 'unknown document type'}"
        )

    # Create job record
    job_repo = JobRepository(db)
    job = job_repo.create(jd, job_text)

    # Create batch run with token
    run_repo = EvaluationRunRepository(db)
    run, token = run_repo.create_with_token(job.id, email)

    # Process files
    item_repo = EvaluationRunItemRepository(db)
    uploaded = 0
    failed = 0
    errors: list[str] = []
    duplicate_files: list[str] = []

    for file in files:
        try:
            filename = validate_pdf_filename(file.filename)

            if item_repo.filename_exists(run.id, filename):
                duplicate_files.append(filename)
                failed += 1
                continue

            content, file_size = await read_pdf_content(file)
            save_uploaded_file(run.folder_path, filename, content)
            item_repo.create_uploaded(run.id, filename, file_size)
            run_repo.adjust_total_count(run.id)
            uploaded += 1

        except ValidationError as e:
            errors.append(f"{file.filename or 'unknown'}: {e.message}")
            failed += 1
        except Exception as e:
            errors.append(f"{file.filename or 'unknown'}: {str(e)[:100]}")
            failed += 1

    if duplicate_files:
        errors.append(f"{', '.join(duplicate_files)}: already exists in this batch")

    # Give back units for resumes that never made it to a worker (rejected PDFs,
    # duplicates). The JD parse is deliberately NOT refunded: that model call
    # already happened above. Covers the partial case too, not just uploaded==0.
    refund((len(files) - uploaded) * COST_RESUME)

    # Check if we have any valid files
    if uploaded == 0:
        run_repo.delete(run.id)
        job_repo.delete(job.id)
        raise ValidationError(
            f"No valid PDF files uploaded. Errors: {'; '.join(errors)}"
        )

    # Transition items and run to pending
    item_repo.mark_uploaded_as_pending(run.id)
    run_repo.mark_pending(run.id)

    # Dispatch Celery task
    try:
        process_evaluation_run.delay(str(run.id))
    except Exception as e:
        run_repo.mark_failed(run.id, str(e))
        raise ValidationError(f"Failed to start batch processing: {e}")

    return CreateBatchResponse(
        token=token,
        uploaded=uploaded,
        failed=failed,
        errors=errors,
    )


@router.get("/status/{token}", response_model=BatchStatusResponse)
def get_batch_status_by_token(
    token: str, db: Session = Depends(get_db)
) -> BatchStatusResponse:
    """
    Get batch evaluation status and results by access token.

    Returns progress information during processing, and ranked results
    when complete.
    """
    run_repo = EvaluationRunRepository(db)
    run = run_repo.get_by_token(token, with_items=True, with_job=True)

    if not run:
        raise NotFoundError("Batch", token)

    job_summary = None
    if run.job:
        job_summary = JobSummary(
            title=run.job.title,
            company_name=run.job.company_name,
        )

    progress = ProgressInfo(
        total=run.total_count,
        processed=run.processed_count,
        failed=run.failed_count,
    )

    results: list[CandidateResult] = []
    candidate_repo = CandidateRepository(db)

    if run.items:
        sorted_items = sorted(
            run.items,
            key=lambda x: (
                x.status != "completed",
                -(
                    x.evaluation.final_score
                    if x.evaluation and x.evaluation.final_score
                    else 0
                ),
            ),
        )

        for item in sorted_items:
            candidate_name = None
            if item.candidate_id:
                candidate = candidate_repo.get_by_id(item.candidate_id)
                candidate_name = candidate.name if candidate else None

            results.append(
                CandidateResult(
                    item_id=item.id,
                    candidate_id=item.candidate_id,
                    candidate_name=candidate_name,
                    filename=item.pdf_filename,
                    final_score=item.evaluation.final_score
                    if item.evaluation
                    else None,
                    hire_signal=item.evaluation.hire_signal
                    if item.evaluation
                    else None,
                    status=item.status,
                )
            )

    return BatchStatusResponse(
        run_id=run.id,
        status=run.status,
        progress=progress,
        job=job_summary,
        results=results,
        processing_time_seconds=run.processing_time_seconds,
        created_at=run.created_at,
    )


@router.post("/status/{token}/add-candidates", response_model=AddCandidatesResponse)
async def add_candidates_to_batch(
    token: str,
    files: list[UploadFile] = [],
    db: Session = Depends(get_db),
) -> AddCandidatesResponse:
    """
    Add new candidate PDFs to an already-completed (or failed) batch run.

    The new resumes are evaluated against the same job description as the
    original batch. Already-evaluated candidates are not re-processed.

    Allowed only when the run status is 'completed' or 'failed'. Returns
    400 if the run is currently pending or processing.
    """
    if not files:
        raise ValidationError("At least one PDF file is required")

    run_repo = EvaluationRunRepository(db)
    run = run_repo.get_by_token_for_update(token)
    if not run:
        raise NotFoundError("Batch", token)

    enforce_anonymous_resume_cap(run.total_count, len(files))

    allowed_statuses = {RunStatus.COMPLETED.value, RunStatus.FAILED.value}
    if run.status not in allowed_statuses:
        raise ValidationError(
            f"Cannot add candidates to a run with status '{run.status}'. "
            "The run must be completed or failed."
        )

    enforce_budget(len(files) * COST_RESUME)

    item_repo = EvaluationRunItemRepository(db)
    uploaded_items: list[tuple[str, UUID]] = []  # (filename, item_id)
    failed = 0
    errors: list[str] = []
    duplicate_files: list[str] = []

    for file in files:
        try:
            filename = validate_pdf_filename(file.filename)

            if item_repo.filename_exists(run.id, filename):
                duplicate_files.append(filename)
                failed += 1
                continue

            content, file_size = await read_pdf_content(file)
            save_uploaded_file(run.folder_path, filename, content)
            item = item_repo.create_uploaded(run.id, filename, file_size)
            uploaded_items.append((filename, item.id))

        except ValidationError as e:
            errors.append(f"{file.filename or 'unknown'}: {e.message}")
            failed += 1
        except Exception as e:
            errors.append(f"{file.filename or 'unknown'}: {str(e)[:100]}")
            failed += 1

    uploaded = len(uploaded_items)

    if duplicate_files:
        errors.append(f"{', '.join(duplicate_files)}: already exists in this batch")

    # Give back units for resumes no worker will ever see.
    refund((len(files) - uploaded) * COST_RESUME)

    if uploaded == 0:
        raise ValidationError(
            f"No valid PDF files uploaded. Errors: {'; '.join(errors)}"
        )

    run_repo.adjust_total_count(run.id, uploaded)
    item_repo.mark_uploaded_as_pending(run.id)
    run_repo.mark_reopened(run.id)  # commits, releasing the FOR UPDATE lock

    try:
        process_evaluation_run.delay(str(run.id))
    except Exception as e:
        run_repo.mark_failed(run.id, str(e))
        for filename, item_id in uploaded_items:
            file_path = resolve_file_path(run.folder_path, filename)
            delete_file(file_path)
            item_repo.delete_item(item_id)
        run_repo.adjust_total_count(run.id, -uploaded)
        raise ValidationError(f"Failed to start batch processing: {e}")

    return AddCandidatesResponse(
        uploaded=uploaded,
        failed=failed,
        errors=errors,
        run_status=RunStatus.PENDING.value,
    )


@router.post(
    "/status/{token}/retry-failed",
    response_model=RetryFailedResponse,
)
def retry_all_failed(
    token: str,
    db: Session = Depends(get_db),
) -> RetryFailedResponse:
    """
    Retry all failed items in a completed or failed batch run.

    Re-queues every item with status 'failed' for re-evaluation against the
    same job description. The PDF files must still be present on disk (they
    are never deleted after upload). Returns 400 if the run is currently
    pending or processing, or if there are no failed items to retry.
    """
    run_repo = EvaluationRunRepository(db)
    run = run_repo.get_by_token_for_update(token)
    if not run:
        raise NotFoundError("Batch", token)

    allowed_statuses = {RunStatus.COMPLETED.value, RunStatus.FAILED.value}
    if run.status not in allowed_statuses:
        raise ValidationError(
            f"Cannot retry items in a run with status '{run.status}'. "
            "The run must be completed or failed."
        )

    item_repo = EvaluationRunItemRepository(db)
    failed_items = item_repo.get_failed_items(run.id)
    if not failed_items:
        raise ValidationError("No failed items to retry in this batch.")

    # Cooldown as well as budget: retry is the one control a frustrated user
    # clicks repeatedly, and a unit budget alone would let a hundred scripted
    # clicks through as long as units remain.
    enforce_cooldown(f"retry:{run.id}", _RETRY_COOLDOWN_MESSAGE)
    enforce_budget(len(failed_items) * COST_RESUME)

    failed_item_ids = [item.id for item in failed_items]
    item_repo.mark_items_as_pending(failed_item_ids)
    run_repo.mark_reopened(run.id)

    try:
        process_evaluation_run.delay(str(run.id))
    except Exception as e:
        run_repo.mark_failed(run.id, str(e))
        raise ValidationError(f"Failed to start batch processing: {e}")

    return RetryFailedResponse(
        retried=len(failed_item_ids),
        run_status=RunStatus.PENDING.value,
    )


@router.post(
    "/status/{token}/retry-failed/{item_id}",
    response_model=RetryFailedResponse,
)
def retry_single_failed(
    token: str,
    item_id: UUID,
    db: Session = Depends(get_db),
) -> RetryFailedResponse:
    """
    Retry a single failed item in a completed or failed batch run.

    Re-queues the specified item for re-evaluation. Returns 404 if the item
    does not belong to this run or is not in a failed state.
    """
    run_repo = EvaluationRunRepository(db)
    run = run_repo.get_by_token_for_update(token)
    if not run:
        raise NotFoundError("Batch", token)

    allowed_statuses = {RunStatus.COMPLETED.value, RunStatus.FAILED.value}
    if run.status not in allowed_statuses:
        raise ValidationError(
            f"Cannot retry items in a run with status '{run.status}'. "
            "The run must be completed or failed."
        )

    item_repo = EvaluationRunItemRepository(db)
    item = item_repo.get_by_id(item_id)
    if not item or item.evaluation_run_id != run.id:
        raise NotFoundError("Item", str(item_id))

    if item.status != "failed":
        raise ValidationError(
            f"Item is not in a failed state (current status: '{item.status}')."
        )

    enforce_cooldown(f"retry:{run.id}", _RETRY_COOLDOWN_MESSAGE)
    enforce_budget(COST_RESUME)

    item_repo.mark_items_as_pending([item_id])
    run_repo.mark_reopened(run.id)

    try:
        process_evaluation_run.delay(str(run.id))
    except Exception as e:
        run_repo.mark_failed(run.id, str(e))
        raise ValidationError(f"Failed to start batch processing: {e}")

    return RetryFailedResponse(
        retried=1,
        run_status=RunStatus.PENDING.value,
    )


@router.get(
    "/status/{token}/candidate/{candidate_id}",
    response_model=CandidateBreakdownResponse,
)
def get_candidate_breakdown(
    token: str,
    candidate_id: UUID,
    db: Session = Depends(get_db),
) -> CandidateBreakdownResponse:
    """
    Get full evaluation breakdown for a single candidate, authenticated by
    the batch access token.
    """
    run_repo = EvaluationRunRepository(db)
    run = run_repo.get_by_token(token, with_items=True)
    if not run:
        raise NotFoundError("Batch", token)

    matching_item = next(
        (item for item in run.items if item.candidate_id == candidate_id),
        None,
    )
    if not matching_item:
        raise NotFoundError("Candidate", str(candidate_id))

    eval_repo = EvaluationRepository(db)
    evaluation = eval_repo.get_by_candidate_and_job(candidate_id, run.job_id)
    if not evaluation:
        raise NotFoundError("Evaluation", str(candidate_id))

    candidate_repo = CandidateRepository(db)
    candidate = candidate_repo.get_by_id(candidate_id)

    skills = (
        SkillScoreResult.model_validate(evaluation.skill_result)
        if evaluation.skill_result
        else None
    )
    experience = (
        ExperienceScoreResult.model_validate(evaluation.experience_result)
        if evaluation.experience_result
        else None
    )
    education = (
        EducationScoreResult.model_validate(evaluation.education_result)
        if evaluation.education_result
        else None
    )

    return CandidateBreakdownResponse(
        candidate_id=candidate_id,
        candidate_name=candidate.name if candidate else None,
        resume_markdown=candidate.resume_markdown if candidate else None,
        filename=matching_item.pdf_filename,
        final_score=evaluation.final_score,
        hire_signal=evaluation.hire_signal,
        skill_score=evaluation.skill_score,
        experience_score=evaluation.experience_score,
        education_score=evaluation.education_score,
        summary=evaluation.summary,
        skills=skills,
        experience=experience,
        education=education,
    )


# There is deliberately no anonymous "list past runs" endpoint. Access tokens
# ARE the authorization model for this surface -- holding one grants results,
# add-candidates, and both retries on that run -- so any endpoint that returns
# a set of them to an unidentified caller is a full authorization bypass, not a
# listing. There is no server-side identity to scope such a query by. If the
# demo flow ever needs run history, build it from the tokens the browser has
# already visited in localStorage.

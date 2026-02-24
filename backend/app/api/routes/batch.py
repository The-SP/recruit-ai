from uuid import UUID

from fastapi import APIRouter, Depends, Form, UploadFile
from pydantic import EmailStr
from sqlalchemy.orm import Session

from app.api.dependencies import get_db
from app.api.exceptions import NotFoundError, ValidationError
from app.api.schemas.batch import (
    BatchCreateRequest,
    BatchFileResponse,
    BatchFilesListResponse,
    BatchFilesUploadResponse,
    BatchFileUploadResult,
    BatchResultItem,
    BatchResultsResponse,
    BatchRunResponse,
)
from app.api.schemas.public import (
    BatchStatusResponse,
    CandidateBreakdownResponse,
    CandidateResult,
    CreateBatchResponse,
    JobSummary,
    ProgressInfo,
)
from app.core.file_storage import delete_file, save_uploaded_file
from app.core.file_upload import read_pdf_content, validate_pdf_filename
from app.core.job_description_parser import parse_job_description
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

    for file in files:
        try:
            filename = validate_pdf_filename(file.filename)

            if item_repo.filename_exists(run.id, filename):
                errors.append(f"{filename}: duplicate filename")
                failed += 1
                continue

            content, file_size = await read_pdf_content(file)
            save_uploaded_file(run.folder_path, filename, content)
            item_repo.create_uploaded(run.id, filename, file_size)
            run_repo.increment_total_count(run.id)
            uploaded += 1

        except ValidationError as e:
            errors.append(f"{file.filename or 'unknown'}: {e.message}")
            failed += 1
        except Exception as e:
            errors.append(f"{file.filename or 'unknown'}: {str(e)[:100]}")
            failed += 1

    # Check if we have any valid files
    if uploaded == 0:
        run_repo.delete(run.id)
        job_repo.delete(job.id)
        raise ValidationError(
            f"No valid PDF files uploaded. Errors: {'; '.join(errors)}"
        )

    # Transition items and run to pending
    item_repo.mark_all_pending(run.id)
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


# =============================================================================
# Internal Multi-Step API
# =============================================================================


@router.post("", response_model=BatchRunResponse, status_code=201)
def create_batch(
    request: BatchCreateRequest, db: Session = Depends(get_db)
) -> BatchRunResponse:
    """Create a draft batch run for uploading files."""
    job_repo = JobRepository(db)
    job = job_repo.get_by_id(request.job_id)
    if not job:
        raise NotFoundError("Job", str(request.job_id))

    run_repo = EvaluationRunRepository(db)
    run = run_repo.create_draft(request.job_id)

    return BatchRunResponse.model_validate(run)


@router.get("/{run_id}", response_model=BatchRunResponse)
def get_batch(run_id: UUID, db: Session = Depends(get_db)) -> BatchRunResponse:
    """Get batch run status."""
    repo = EvaluationRunRepository(db)
    run = repo.get_by_id(run_id)

    if not run:
        raise NotFoundError("Batch run", str(run_id))

    return BatchRunResponse.model_validate(run)


@router.post(
    "/{run_id}/files", response_model=BatchFilesUploadResponse, status_code=201
)
async def upload_files(
    run_id: UUID, files: list[UploadFile], db: Session = Depends(get_db)
) -> BatchFilesUploadResponse:
    """Upload one or more PDF files to a draft batch."""
    run_repo = EvaluationRunRepository(db)
    run = run_repo.get_by_id(run_id)

    if not run:
        raise NotFoundError("Batch run", str(run_id))

    if run.status != RunStatus.DRAFT.value:
        raise ValidationError("Cannot upload files to a batch that has already started")

    item_repo = EvaluationRunItemRepository(db)
    results: list[BatchFileUploadResult] = []
    uploaded = 0
    failed = 0

    for file in files:
        try:
            filename = validate_pdf_filename(file.filename)

            if item_repo.filename_exists(run_id, filename):
                results.append(
                    BatchFileUploadResult(
                        filename=filename,
                        success=False,
                        error="File already exists in this batch",
                    )
                )
                failed += 1
                continue

            content, file_size = await read_pdf_content(file)
            save_uploaded_file(run.folder_path, filename, content)
            item = item_repo.create_uploaded(run_id, filename, file_size)
            run_repo.increment_total_count(run_id)

            results.append(
                BatchFileUploadResult(filename=filename, success=True, file_id=item.id)
            )
            uploaded += 1

        except ValidationError as e:
            results.append(
                BatchFileUploadResult(
                    filename=file.filename or "unknown",
                    success=False,
                    error=e.message,
                )
            )
            failed += 1

        except Exception as e:
            results.append(
                BatchFileUploadResult(
                    filename=file.filename or "unknown",
                    success=False,
                    error=str(e)[:200],
                )
            )
            failed += 1

    return BatchFilesUploadResponse(uploaded=uploaded, failed=failed, results=results)


@router.get("/{run_id}/files", response_model=BatchFilesListResponse)
def list_files(run_id: UUID, db: Session = Depends(get_db)) -> BatchFilesListResponse:
    """List all uploaded files in a batch."""
    run_repo = EvaluationRunRepository(db)
    run = run_repo.get_by_id(run_id)

    if not run:
        raise NotFoundError("Batch run", str(run_id))

    item_repo = EvaluationRunItemRepository(db)
    items = item_repo.get_by_run(run_id)

    return BatchFilesListResponse(
        items=[BatchFileResponse.model_validate(item) for item in items],
        total=len(items),
    )


@router.delete("/{run_id}/files/{item_id}", status_code=204)
def delete_batch_file(
    run_id: UUID, item_id: UUID, db: Session = Depends(get_db)
) -> None:
    """Remove a file from a draft batch."""
    run_repo = EvaluationRunRepository(db)
    run = run_repo.get_by_id(run_id)

    if not run:
        raise NotFoundError("Batch run", str(run_id))

    if run.status != RunStatus.DRAFT.value:
        raise ValidationError(
            "Cannot remove files from a batch that has already started"
        )

    item_repo = EvaluationRunItemRepository(db)
    item = item_repo.get_by_id(item_id)

    if not item:
        raise NotFoundError("File", str(item_id))

    if item.evaluation_run_id != run_id:
        raise NotFoundError("File", str(item_id))

    delete_file(run_id, item.pdf_filename)
    item_repo.delete_item(item_id)
    run_repo.decrement_total_count(run_id)


@router.post("/{run_id}/start", response_model=BatchRunResponse)
def start_batch(run_id: UUID, db: Session = Depends(get_db)) -> BatchRunResponse:
    """Start processing a draft batch."""
    run_repo = EvaluationRunRepository(db)
    run = run_repo.get_by_id(run_id)

    if not run:
        raise NotFoundError("Batch run", str(run_id))

    if run.status != RunStatus.DRAFT.value:
        raise ValidationError(
            f"Cannot start batch with status '{run.status}'. Only draft batches can be started."
        )

    if run.total_count == 0:
        raise ValidationError("Cannot start batch with no files")

    item_repo = EvaluationRunItemRepository(db)
    item_repo.mark_all_pending(run_id)
    run_repo.mark_pending(run_id)

    try:
        process_evaluation_run.delay(str(run_id))
    except Exception as e:
        run_repo.mark_failed(run_id, str(e))
        raise ValidationError(f"Failed to start batch processing: {e}")

    db.refresh(run)

    return BatchRunResponse.model_validate(run)


@router.get("/{run_id}/results", response_model=BatchResultsResponse)
def get_batch_results(
    run_id: UUID, db: Session = Depends(get_db)
) -> BatchResultsResponse:
    """Get results from a batch run."""
    run_repo = EvaluationRunRepository(db)
    run = run_repo.get_by_id(run_id, with_items=True)

    if not run:
        raise NotFoundError("Batch run", str(run_id))

    candidate_repo = CandidateRepository(db)
    items = []

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

        items.append(
            BatchResultItem(
                candidate_id=item.candidate_id,
                candidate_name=candidate_name,
                filename=item.pdf_filename,
                final_score=item.evaluation.final_score if item.evaluation else None,
                hire_signal=item.evaluation.hire_signal if item.evaluation else None,
                status=item.status,
            )
        )

    return BatchResultsResponse(
        run_id=run_id,
        status=run.status,
        items=items,
        total=len(items),
    )

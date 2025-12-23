from uuid import UUID

from fastapi import APIRouter, Depends, UploadFile
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
from app.core.file_storage import delete_file, ensure_folder, save_uploaded_file
from app.core.file_upload import read_pdf_content, validate_pdf_filename
from app.models.evaluation_run import RunStatus
from app.repositories.candidate_repository import CandidateRepository
from app.repositories.evaluation_run_repository import (
    EvaluationRunItemRepository,
    EvaluationRunRepository,
)
from app.repositories.job_repository import JobRepository
from app.worker.tasks import process_evaluation_run

router = APIRouter(prefix="/batch", tags=["batch"])


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

    # Create the folder on disk
    ensure_folder(run.folder_path)

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
            # Validate filename
            filename = validate_pdf_filename(file.filename)

            # Check for duplicate
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

            # Read and validate content
            content, file_size = await read_pdf_content(file)

            # Save file
            save_uploaded_file(run.folder_path, filename, content)

            # Create item record
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

    # Delete physical file
    delete_file(run_id, item.pdf_filename)

    # Delete item record
    item_repo.delete_item(item_id)

    # Update total count
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

    # Transition items from 'uploaded' to 'pending'
    item_repo = EvaluationRunItemRepository(db)
    item_repo.mark_all_pending(run_id)

    # Transition run from 'draft' to 'pending'
    run_repo.mark_pending(run_id)

    # Dispatch Celery task
    try:
        process_evaluation_run.delay(str(run_id))
    except Exception as e:
        run_repo.mark_failed(run_id, str(e))
        raise ValidationError(f"Failed to start batch processing: {e}")

    # Refresh to get updated status
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

    # Sort by score descending (completed items first)
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

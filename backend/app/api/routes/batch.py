from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies import get_db
from app.api.exceptions import NotFoundError, ValidationError
from app.api.schemas.batch import (
    BatchCreateRequest,
    BatchResultItem,
    BatchResultsResponse,
    BatchRunResponse,
)
from app.repositories.candidate_repository import CandidateRepository
from app.repositories.evaluation_run_repository import EvaluationRunRepository
from app.repositories.job_repository import JobRepository
from app.worker.tasks import start_evaluation_run

router = APIRouter(prefix="/batch", tags=["batch"])


@router.post("", response_model=BatchRunResponse, status_code=202)
def create_batch_run(
    request: BatchCreateRequest, db: Session = Depends(get_db)
) -> BatchRunResponse:
    """Start a batch evaluation run."""
    # Verify job exists
    job_repo = JobRepository(db)
    job = job_repo.get_by_id(request.job_id)
    if not job:
        raise NotFoundError("Job", str(request.job_id))

    # Dispatch Celery task
    try:
        result = start_evaluation_run.delay(str(request.job_id), request.folder_path)
        run_id = result.get(timeout=60)  # Wait for orchestrator to create run
    except ValueError as e:
        raise ValidationError(str(e))
    except Exception as e:
        raise ValidationError(f"Failed to start batch run: {e}")

    # Fetch created run
    run_repo = EvaluationRunRepository(db)
    run = run_repo.get_by_id(UUID(run_id))
    if not run:
        raise ValidationError("Batch run created but not found")

    return BatchRunResponse.model_validate(run)


@router.get("/{run_id}", response_model=BatchRunResponse)
def get_batch_run(run_id: UUID, db: Session = Depends(get_db)) -> BatchRunResponse:
    """Get batch run status."""
    repo = EvaluationRunRepository(db)
    run = repo.get_by_id(run_id)

    if not run:
        raise NotFoundError("Batch run", str(run_id))

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

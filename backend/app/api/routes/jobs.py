from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.dependencies import get_db
from app.api.exceptions import NotFoundError, ValidationError
from app.api.schemas.evaluations import RankingItem, RankingsResponse
from app.api.schemas.jobs import JobCreateRequest, JobListResponse, JobResponse
from app.core.job_description_parser import parse_job_description
from app.models.job import Job
from app.repositories.candidate_repository import CandidateRepository
from app.repositories.evaluation_repository import EvaluationRepository
from app.repositories.job_repository import JobRepository
from app.schemas.job_utils import build_job_requirements_schema

router = APIRouter(prefix="/jobs", tags=["jobs"])


def _model_to_response(job: Job) -> JobResponse:
    """Convert Job model to JobResponse."""
    requirements = build_job_requirements_schema(job.requirements)

    return JobResponse(
        id=job.id,
        job_title=job.title,
        company_name=job.company_name,
        summary=job.summary,
        requirements=requirements,
        is_valid_jd=job.is_valid_jd,
        document_type=job.document_type,
        created_at=job.created_at,
    )


@router.post("", response_model=JobResponse, status_code=201)
def create_job(request: JobCreateRequest, db: Session = Depends(get_db)) -> JobResponse:
    """Create a job from raw text description."""
    jd = parse_job_description(request.text)

    if not jd.is_job_description:
        raise ValidationError(
            f"Document is not a valid job description. Detected: {jd.document_type}"
        )

    repo = JobRepository(db)
    job = repo.create(jd, request.text)

    return _model_to_response(job)


@router.get("/{job_id}", response_model=JobResponse)
def get_job(job_id: UUID, db: Session = Depends(get_db)) -> JobResponse:
    """Get a job by ID."""
    repo = JobRepository(db)
    job = repo.get_by_id(job_id, with_requirements=True)

    if not job:
        raise NotFoundError("Job", str(job_id))

    return _model_to_response(job)


@router.get("", response_model=JobListResponse)
def list_jobs(
    limit: int = Query(default=10, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> JobListResponse:
    """List jobs with pagination."""
    repo = JobRepository(db)
    jobs = repo.get_all(limit=limit, offset=offset)
    total = repo.count()

    return JobListResponse(
        items=[_model_to_response(job) for job in jobs],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{job_id}/rankings", response_model=RankingsResponse)
def get_job_rankings(
    job_id: UUID,
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
) -> RankingsResponse:
    """Get ranked candidates for a job."""
    repo = JobRepository(db)
    job = repo.get_by_id(job_id)
    if not job:
        raise NotFoundError("Job", str(job_id))

    eval_repo = EvaluationRepository(db)
    evaluations = eval_repo.get_by_job(job_id, limit=limit)

    candidate_repo = CandidateRepository(db)
    items = []
    for e in evaluations:
        candidate = candidate_repo.get_by_id(e.candidate_id)
        items.append(
            RankingItem(
                evaluation_id=e.id,
                candidate_id=e.candidate_id,
                candidate_name=candidate.name if candidate else None,
                final_score=e.final_score,
                hire_signal=e.hire_signal,
            )
        )

    return RankingsResponse(
        job_id=job_id,
        items=items,
        total=len(items),
        limit=limit,
    )

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies import get_db
from app.api.exceptions import NotFoundError, ValidationError
from app.api.schemas.evaluations import (
    EvaluationCreateRequest,
    EvaluationResponse,
)
from app.evaluation.composite_scorer import calculate_composite_score
from app.repositories.candidate_repository import CandidateRepository
from app.repositories.evaluation_repository import EvaluationRepository
from app.repositories.job_repository import JobRepository
from app.schemas.job_description import JobDescriptionResponse
from app.schemas.job_utils import build_job_requirements_schema

router = APIRouter(prefix="/evaluations", tags=["evaluations"])


def _job_to_jd_response(job) -> JobDescriptionResponse:
    """Convert Job model to JobDescriptionResponse for scoring."""
    return JobDescriptionResponse(
        is_job_description=job.is_valid_jd or False,
        document_type=job.document_type,
        job_title=job.title,
        company_name=job.company_name,
        summary=job.summary,
        responsibilities=job.responsibilities,
        requirements=build_job_requirements_schema(job.requirements),
        keywords=job.keywords,
    )


@router.post("", response_model=EvaluationResponse, status_code=201)
def create_evaluation(
    request: EvaluationCreateRequest, db: Session = Depends(get_db)
) -> EvaluationResponse:
    """Score a candidate against a job."""
    # Fetch candidate
    candidate_repo = CandidateRepository(db)
    candidate = candidate_repo.get_by_id(request.candidate_id)
    if not candidate:
        raise NotFoundError("Candidate", str(request.candidate_id))

    if not candidate.resume_markdown:
        raise ValidationError("Candidate has no parsed resume content")

    # Fetch job
    job_repo = JobRepository(db)
    job = job_repo.get_by_id(request.job_id, with_requirements=True)
    if not job:
        raise NotFoundError("Job", str(request.job_id))

    # Convert to JD response for scorer
    jd = _job_to_jd_response(job)

    # Run composite scoring
    result = calculate_composite_score(jd=jd, resume_markdown=candidate.resume_markdown)

    # Store evaluation (upsert to handle re-scoring)
    eval_repo = EvaluationRepository(db)
    evaluation = eval_repo.upsert(request.candidate_id, request.job_id, result)

    return EvaluationResponse.model_validate(evaluation)


@router.get("/{evaluation_id}", response_model=EvaluationResponse)
def get_evaluation(
    evaluation_id: UUID, db: Session = Depends(get_db)
) -> EvaluationResponse:
    """Get an evaluation by ID."""
    repo = EvaluationRepository(db)
    evaluation = repo.get_by_id(evaluation_id)

    if not evaluation:
        raise NotFoundError("Evaluation", str(evaluation_id))

    return EvaluationResponse.model_validate(evaluation)

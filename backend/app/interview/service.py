from datetime import datetime
from uuid import UUID

from sqlalchemy.orm import Session

from app.api.exceptions import NotFoundError, ValidationError
from app.config import Config
from app.core.logger import init_logger
from app.interview.question_generator import build_grounding, generate_script
from app.models.evaluation_run import EvaluationRun
from app.models.interview import Interview, InterviewStatus, TurnRole
from app.repositories.candidate_repository import CandidateRepository
from app.repositories.evaluation_repository import EvaluationRepository
from app.repositories.interview_repository import InterviewRepository
from app.repositories.job_repository import JobRepository

logger = init_logger(__name__)


def resolve_evaluation_id(db: Session, run: EvaluationRun, candidate_id: UUID) -> UUID:
    """Resolve a candidate within a run to its evaluation, or raise 404.

    Mirrors the candidate-breakdown endpoints: membership is checked against
    the run's items, then the evaluation is looked up by (candidate, job).
    """
    matching_item = next(
        (item for item in run.items if item.candidate_id == candidate_id),
        None,
    )
    if not matching_item:
        raise NotFoundError("Candidate", str(candidate_id))

    evaluation = EvaluationRepository(db).get_by_candidate_and_job(
        candidate_id, run.job_id
    )
    if not evaluation:
        raise NotFoundError("Evaluation", str(candidate_id))

    return evaluation.id


def apply_lazy_expiry(db: Session, interview: Interview) -> Interview:
    """Persist the `expired` state when the invite is overdue.

    There is no scheduler in this repo and nothing needs to *happen* at the
    expiry moment — the state only needs to be correct when observed, so
    whichever request notices writes it.
    """
    overdue_states = {InterviewStatus.CREATED.value, InterviewStatus.IN_PROGRESS.value}
    if interview.status in overdue_states and interview.expires_at < datetime.now():
        return InterviewRepository(db).mark_expired(interview)
    return interview


def create_interview(
    db: Session, run: EvaluationRun, candidate_id: UUID
) -> tuple[Interview, bool]:
    """Create an interview invite for a candidate in a run.

    Idempotent: if one already exists for the evaluation it is returned
    untouched. Returns (interview, created) so the route can pick 200 vs 201.
    """
    evaluation_id = resolve_evaluation_id(db, run, candidate_id)
    interview_repo = InterviewRepository(db)

    existing = interview_repo.get_by_evaluation_id(evaluation_id)
    if existing:
        logger.info(
            f"Interview already exists for evaluation {evaluation_id}; returning it"
        )
        return apply_lazy_expiry(db, existing), False

    evaluation = EvaluationRepository(db).get_by_id(evaluation_id)
    if not evaluation:
        raise NotFoundError("Evaluation", str(evaluation_id))

    candidate = CandidateRepository(db).get_by_id(candidate_id)
    if not candidate:
        raise NotFoundError("Candidate", str(candidate_id))

    job = JobRepository(db).get_by_id(run.job_id, with_requirements=True)
    if not job:
        raise NotFoundError("Job", str(run.job_id))

    grounding = build_grounding(job, candidate, evaluation)
    script = generate_script(grounding)

    interview = interview_repo.create(
        evaluation_id=evaluation_id,
        question_script=script.model_dump(mode="json"),
        grounding=grounding,
        model_name=Config.INTERVIEW_MODEL_NAME,
    )
    return interview, True


def get_interview(db: Session, run: EvaluationRun, candidate_id: UUID) -> Interview:
    """Load the interview for a candidate in a run, applying lazy expiry."""
    evaluation_id = resolve_evaluation_id(db, run, candidate_id)
    interview = InterviewRepository(db).get_by_evaluation_id(evaluation_id)
    if not interview:
        raise NotFoundError("Interview", str(candidate_id))
    return apply_lazy_expiry(db, interview)


def reissue_interview(db: Session, run: EvaluationRun, candidate_id: UUID) -> Interview:
    """Rotate the token and expiry so a fresh link can be sent.

    Allowed only while `created`, or `expired` with no answers yet — reissuing
    can never wipe a transcript.
    """
    interview = get_interview(db, run, candidate_id)
    repo = InterviewRepository(db)

    if interview.status == InterviewStatus.CREATED.value:
        return repo.rotate_token(interview)

    if interview.status == InterviewStatus.EXPIRED.value:
        answered = any(
            turn.role == TurnRole.CANDIDATE.value
            for turn in repo.get_turns(interview.id)
        )
        if not answered:
            return repo.rotate_token(interview)
        raise ValidationError(
            "Cannot reissue an expired interview that already has answers. "
            "Assess the partial transcript instead."
        )

    raise ValidationError(
        f"Cannot reissue an interview with status '{interview.status}'."
    )

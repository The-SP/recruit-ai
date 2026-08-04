"""Interview background work, kept out of tasks.py (the batch-scoring
pipeline). Registered via the include list in celery_app.py."""

from contextlib import closing
from typing import Any
from uuid import UUID

from app.core.logger import init_logger
from app.interview.assessor import assess_transcript
from app.models.database import create_session
from app.models.interview import InterviewStatus
from app.repositories.interview_repository import InterviewRepository
from app.worker.celery_app import celery_app

logger = init_logger(__name__)

# States an assessment may run from: normal completion, or an expired
# interview whose partial transcript a recruiter chose to assess.
#
# Deliberately looser than the service-layer guard in request_assessment: this
# one only rejects rows that went stale between dispatch and execution, while
# authorization (e.g. "expired but nobody answered") is the service's job.
ASSESSABLE_STATUSES = {
    InterviewStatus.COMPLETED.value,
    InterviewStatus.EXPIRED.value,
}


@celery_app.task(name="assess_interview")
def assess_interview(interview_id: str) -> dict[str, Any]:
    """Assess a finished interview's transcript and store the verdict.

    Deliberately does NOT consult the circuit breaker, unlike the batch tasks
    in tasks.py: the breaker exists to stop a runaway batch from burning the
    shared scoring quota, while this is one interactive-feature call on the
    interview's own key (Config.INTERVIEW_GOOGLE_API_KEY).
    """
    with closing(create_session()) as db:
        repo = InterviewRepository(db)
        interview = repo.get_by_id(UUID(interview_id))

        if not interview:
            logger.error(f"assess_interview: interview {interview_id} not found")
            return {"status": "failed", "error": "Interview not found"}

        if interview.status == InterviewStatus.ASSESSED.value:
            logger.info(f"Interview {interview_id} already assessed; skipping")
            return {"status": "skipped", "reason": "already assessed"}

        if interview.status not in ASSESSABLE_STATUSES:
            logger.warning(
                f"Interview {interview_id} not assessable from "
                f"status '{interview.status}'; skipping"
            )
            return {"status": "skipped", "reason": interview.status}

        turns = repo.get_turns(interview.id)

        try:
            assessment = assess_transcript(interview, turns)
        except Exception as e:
            logger.error(f"Assessment failed for interview {interview_id}: {e}")
            repo.store_assessment_error(interview, str(e)[:500])
            return {"status": "failed", "error": str(e)[:200]}

        repo.store_assessment(interview, assessment.model_dump(mode="json"))
        return {"status": "assessed", "interview_id": interview_id}

"""Interview background work, kept out of tasks.py (the batch-scoring
pipeline). Registered via the include list in celery_app.py."""

from contextlib import closing
from typing import Any
from uuid import UUID

from app.core.logger import init_logger
from app.interview.assessor import assess_transcript
from app.interview.speaker import (
    script_voice_keys,
    synthesize_and_store,
    voice_is_cached,
)
from app.models.database import create_session
from app.models.interview import InterviewStatus
from app.repositories.interview_repository import InterviewRepository
from app.schemas.interview import InterviewScript
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


@celery_app.task(name="synthesize_interview_voice")
def synthesize_interview_voice(interview_id: str) -> dict[str, Any]:
    """Pre-synthesize the interviewer speech that can be known in advance.

    Warms the cache for every slot whose text is verbatim from the frozen
    question_script -- the opening and the core questions -- so a candidate
    never waits on them. Follow-ups and closings cannot be precomputed: they
    do not exist yet, or (for closings) the engine picks between two different
    texts at runtime. Those synthesize on first fetch instead.

    This task is a pure optimization and is written to be one. Every failure is
    swallowed per slot, because the audio endpoint synthesizes on demand for
    anything missing: a dead worker, a quota trip, or a bad slot costs latency
    on first play and nothing else. Nothing here may affect the invite, which
    has already been created and handed to the recruiter by the time this runs.

    Like assess_interview, deliberately does NOT consult the circuit breaker:
    the breaker guards the shared scoring quota from a runaway batch, while
    this is interview work on the interview's own key.
    """
    with closing(create_session()) as db:
        interview = InterviewRepository(db).get_by_id(UUID(interview_id))

        if not interview:
            logger.error(
                f"synthesize_interview_voice: interview {interview_id} not found"
            )
            return {"status": "failed", "error": "Interview not found"}

        if not interview.voice_on:
            return {"status": "skipped", "reason": "voice off"}

        try:
            script = InterviewScript.model_validate(interview.question_script)
        except Exception as e:
            logger.error(f"Unreadable script for interview {interview_id}: {e}")
            return {"status": "failed", "error": "Unreadable question script"}

        synthesized = cached = failed = 0

        for key, text in script_voice_keys(script):
            if voice_is_cached(interview.id, key):
                cached += 1
                continue
            try:
                synthesize_and_store(interview.id, key, text)
                synthesized += 1
            except Exception as e:
                # Per slot, so one bad clip can't cost the rest of the interview
                # its head start.
                logger.warning(
                    f"Voice synthesis failed for interview {interview_id} "
                    f"key '{key}': {e}"
                )
                failed += 1

        logger.info(
            f"Interview {interview_id} voice precompute: synthesized={synthesized} "
            f"cached={cached} failed={failed}"
        )
        return {
            "status": "completed",
            "interview_id": interview_id,
            "synthesized": synthesized,
            "cached": cached,
            "failed": failed,
        }

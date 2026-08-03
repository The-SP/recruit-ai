"""The voice seam: this module speaks typed text events only. Transport (SSE
today, audio in Phase 2) lives in the route layer; nothing here may import
FastAPI types, and EngineEvent carries no Any.
"""

from collections.abc import Iterator
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from langchain.agents import create_agent
from langchain.agents.structured_output import ToolStrategy
from sqlalchemy.orm import Session

from app.api.exceptions import ConflictError, ValidationError
from app.config import Config
from app.core.logger import init_logger
from app.core.model_factory import build_model
from app.interview.constants import INTERVIEW_TIME_LIMIT_SECONDS
from app.interview.state import question_number, time_remaining_seconds
from app.models.interview import (
    Interview,
    InterviewStatus,
    InterviewTurn,
    TurnKind,
    TurnRole,
)
from app.repositories.interview_repository import InterviewRepository
from app.schemas.interview import FollowupDecision, InterviewQuestion, InterviewScript

logger = init_logger(__name__)


# ---------------------------------------------------------------------------
# Engine events
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class AnswerAccepted:
    answer_seq: int


@dataclass(frozen=True)
class InterviewerTurn:
    turn: InterviewTurn  # persisted before this event is yielded


@dataclass(frozen=True)
class StateChanged:
    status: str
    question_number: int
    total_questions: int
    time_remaining_seconds: int | None


EngineEvent = AnswerAccepted | InterviewerTurn | StateChanged


# ---------------------------------------------------------------------------
# Follow-up decision
# ---------------------------------------------------------------------------

FOLLOWUP_SYSTEM_PROMPT = (
    "You are an experienced technical interviewer conducting a short screening "
    "interview. You decide whether one brief follow-up question is warranted."
)

FOLLOWUP_PROMPT = """The candidate just answered a screening question.

## The question
{question_text}

It probes: {subject}

## The candidate's answer
{answer}

## Decide

Ask exactly one short follow-up ONLY if it would meaningfully sharpen the
signal: the answer was vague where the rubric wanted specifics, made a claim
worth probing, or skipped the core of the question. If the answer already
covers the rubric (or is so far off that a follow-up wouldn't help), do not
ask one.

A good follow-up is one conversational sentence, answerable in under a minute,
and refers to something the candidate actually said. Never repeat the original
question, never stack multiple questions, and never ask about protected
characteristics."""


def _decide_followup(question: InterviewQuestion, answer: str) -> str | None:
    """One structured LLM call; returns the follow-up text or None.

    Any failure (LLM error, ask_followup without text) degrades to None: a
    lost follow-up must never strand the interview.
    """
    prompt = FOLLOWUP_PROMPT.format(
        question_text=question.text,
        subject=question.subject,
        answer=answer,
    )
    try:
        agent = create_agent(
            model=build_model(
                Config.INTERVIEW_MODEL_NAME, Config.INTERVIEW_GOOGLE_API_KEY or None
            ),
            system_prompt=FOLLOWUP_SYSTEM_PROMPT,
            response_format=ToolStrategy(FollowupDecision),
        )
        messages: list[Any] = [{"role": "user", "content": prompt}]
        result = agent.invoke({"messages": messages})
        decision: FollowupDecision = result["structured_response"]
    except Exception as e:
        logger.warning(f"Follow-up decision failed, advancing instead: {e}")
        return None

    if not decision.ask_followup:
        return None
    if not decision.followup_question or not decision.followup_question.strip():
        logger.warning("Model asked for a follow-up without providing one; advancing")
        return None
    return decision.followup_question.strip()


# ---------------------------------------------------------------------------
# The loop
# ---------------------------------------------------------------------------


def start_interview(db: Session, interview: Interview) -> Interview:
    """Insert the opening + first-question turns and mark the interview started.

    Caller must hold the row lock (get_by_token_for_update) and have verified
    status == created; the single append call keeps turns and status atomic.
    """
    script = InterviewScript.model_validate(interview.question_script)
    InterviewRepository(db).append_turns_and_advance(
        interview,
        [
            {
                "role": TurnRole.INTERVIEWER.value,
                "kind": TurnKind.OPENING.value,
                "content": script.opening,
            },
            {
                "role": TurnRole.INTERVIEWER.value,
                "kind": TurnKind.QUESTION.value,
                "question_index": 0,
                "content": script.questions[0].text,
            },
        ],
        mark_started=True,
    )
    logger.info(f"Interview started: id={interview.id}")
    return interview


def validate_answerable(db: Session, interview: Interview, after_seq: int) -> None:
    """The rules an answer must satisfy, in one place.

    Called twice per submission: once by the route before the stream opens (so
    a rejection gets a real HTTP status) and once by submit_answer under the
    row lock (so a race lost in between is still caught). Keeping both callers
    on this function is what stops the HTTP status and the SSE error frame
    from disagreeing about why an answer was refused.
    """
    if interview.status != InterviewStatus.IN_PROGRESS.value:
        raise ValidationError(
            f"Interview is not in progress (status: '{interview.status}')."
        )
    if interview.expires_at < datetime.now():
        InterviewRepository(db).mark_expired(interview)
        raise ValidationError("This interview invite has expired.")
    if after_seq != interview.last_seq:
        raise ConflictError(
            "Out-of-sequence answer: the interview advanced since this client "
            "last fetched state. Refetch and retry."
        )


def submit_answer(
    db: Session, interview: Interview, content: str, after_seq: int
) -> Iterator[EngineEvent]:
    """React to one candidate answer: persist it plus the interviewer's reply.

    Caller must have loaded the interview with get_by_token_for_update. The
    lock is held across the follow-up LLM call so the whole reaction lands in
    one commit (the doc's chosen concurrency story). AnswerAccepted is yielded
    before that commit and means "validated and being processed": if the
    stream fails afterwards nothing was persisted and the client resubmits.
    """
    repo = InterviewRepository(db)

    validate_answerable(db, interview, after_seq)

    script = InterviewScript.model_validate(interview.question_script)
    total = len(script.questions)
    current_index = interview.current_question_index

    yield AnswerAccepted(answer_seq=interview.last_seq + 1)

    answer_spec: dict[str, Any] = {
        "role": TurnRole.CANDIDATE.value,
        "kind": TurnKind.ANSWER.value,
        "question_index": current_index,
        "content": content,
    }

    time_up = (
        interview.started_at is not None
        and datetime.now()
        > interview.started_at + timedelta(seconds=INTERVIEW_TIME_LIMIT_SECONDS)
    )

    completed = False
    next_index = current_index
    followup_asked = interview.followup_asked

    if time_up:
        # Accept this final answer, then close over the partial transcript.
        interviewer_spec: dict[str, Any] = {
            "role": TurnRole.INTERVIEWER.value,
            "kind": TurnKind.CLOSING.value,
            "content": (
                f"We've reached the time limit, so we'll stop here. {script.closing}"
            ),
        }
        completed = True
    else:
        followup_text = None
        if not interview.followup_asked:
            # The <=1-followup-per-question cap is this flag, enforced here
            # regardless of what the model wants.
            followup_text = _decide_followup(script.questions[current_index], content)

        if followup_text is not None:
            interviewer_spec = {
                "role": TurnRole.INTERVIEWER.value,
                "kind": TurnKind.FOLLOWUP.value,
                "question_index": current_index,
                "content": followup_text,
            }
            followup_asked = True
        elif current_index + 1 < total:
            next_index = current_index + 1
            interviewer_spec = {
                "role": TurnRole.INTERVIEWER.value,
                "kind": TurnKind.QUESTION.value,
                "question_index": next_index,
                "content": script.questions[next_index].text,
            }
            followup_asked = False
        else:
            interviewer_spec = {
                "role": TurnRole.INTERVIEWER.value,
                "kind": TurnKind.CLOSING.value,
                "content": script.closing,
            }
            completed = True

    created = repo.append_turns_and_advance(
        interview,
        [answer_spec, interviewer_spec],
        current_question_index=next_index,
        followup_asked=followup_asked,
        mark_completed=completed,
    )

    yield InterviewerTurn(turn=created[1])

    yield StateChanged(
        status=interview.status,
        question_number=question_number(interview),
        total_questions=total,
        time_remaining_seconds=time_remaining_seconds(interview),
    )

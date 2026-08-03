from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.config import Config
from app.interview import state
from app.models.interview import Interview, InterviewTurn
from app.schemas.interview import InterviewScript


def build_invite_url(access_token: str) -> str:
    """Candidate-facing link, same URL-building pattern as email_service."""
    return f"{Config.FRONTEND_URL}/interview?token={access_token}"


class TurnOut(BaseModel):
    """One transcript turn, safe for both candidate and recruiter surfaces."""

    seq: int
    role: str
    kind: str
    question_index: int | None = None
    content: str
    created_at: datetime


class QuestionOut(BaseModel):
    """A core question with its rubric. Never serve this to a candidate —
    subject is the answer."""

    id: int
    text: str
    focus: str
    subject: str


class AnswerRequest(BaseModel):
    """Candidate answer submission. after_seq is the last seq the client has;
    a mismatch with the server's last_seq returns 409."""

    content: str = Field(min_length=1, max_length=5000)
    after_seq: int = Field(ge=0)


class InterviewStateResponse(BaseModel):
    """Candidate-facing state. Must never carry the script, the rubric
    (subject), the assessment, or the access token."""

    status: str
    job_title: str | None = None
    company_name: str | None = None
    question_number: int
    total_questions: int
    time_remaining_seconds: int | None = None
    turns: list[TurnOut] = Field(default_factory=list)


class InterviewSummaryResponse(BaseModel):
    """Response after creating or reissuing an invite."""

    interview_id: UUID
    status: str
    invite_url: str
    access_token: str
    questions_count: int
    expires_at: datetime
    created_at: datetime


class InterviewDetailResponse(BaseModel):
    """Full recruiter view: invite, transcript, rubric, and assessment."""

    interview_id: UUID
    status: str
    invite_url: str
    access_token: str
    model_name: str
    questions_count: int
    current_question_index: int
    questions: list[QuestionOut] = Field(default_factory=list)
    turns: list[TurnOut] = Field(default_factory=list)
    assessment: dict[str, Any] | None = None
    assessment_error: str | None = None
    expires_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None
    assessed_at: datetime | None = None
    created_at: datetime


def _questions_from_script(script_data: dict[str, Any]) -> list[QuestionOut]:
    """Rehydrate the frozen script for recruiter display.

    Falls back to an empty list rather than failing the request: a detail view
    should still render if an older script shape can't be validated.
    """
    try:
        script = InterviewScript.model_validate(script_data)
    except Exception:
        return []
    return [
        QuestionOut(
            id=q.id,
            text=q.text,
            focus=q.focus.value,
            subject=q.subject,
        )
        for q in script.questions
    ]


def build_turn_out(turn: InterviewTurn) -> TurnOut:
    return TurnOut(
        seq=turn.seq,
        role=turn.role,
        kind=turn.kind,
        question_index=turn.question_index,
        content=turn.content,
        created_at=turn.created_at,
    )


def build_state_response(
    interview: Interview, turns: list[InterviewTurn]
) -> InterviewStateResponse:
    grounding = interview.grounding or {}
    return InterviewStateResponse(
        status=interview.status,
        job_title=grounding.get("job_title"),
        company_name=grounding.get("company_name"),
        question_number=state.question_number(interview),
        total_questions=state.total_questions(interview),
        time_remaining_seconds=state.time_remaining_seconds(interview),
        turns=[build_turn_out(t) for t in turns],
    )


def build_summary_response(interview: Interview) -> InterviewSummaryResponse:
    questions = interview.question_script.get("questions", [])
    return InterviewSummaryResponse(
        interview_id=interview.id,
        status=interview.status,
        invite_url=build_invite_url(interview.access_token),
        access_token=interview.access_token,
        questions_count=len(questions),
        expires_at=interview.expires_at,
        created_at=interview.created_at,
    )


def build_detail_response(
    interview: Interview, turns: list[InterviewTurn]
) -> InterviewDetailResponse:
    questions = _questions_from_script(interview.question_script)
    return InterviewDetailResponse(
        interview_id=interview.id,
        status=interview.status,
        invite_url=build_invite_url(interview.access_token),
        access_token=interview.access_token,
        model_name=interview.model_name,
        questions_count=len(questions),
        current_question_index=interview.current_question_index,
        questions=questions,
        turns=[build_turn_out(t) for t in turns],
        assessment=interview.assessment,
        assessment_error=interview.assessment_error,
        expires_at=interview.expires_at,
        started_at=interview.started_at,
        completed_at=interview.completed_at,
        assessed_at=interview.assessed_at,
        created_at=interview.created_at,
    )

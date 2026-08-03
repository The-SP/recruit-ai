from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING, Any
from uuid import UUID, uuid4

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.evaluation import CandidateEvaluation


class InterviewStatus(str, Enum):
    CREATED = "created"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    ASSESSED = "assessed"
    EXPIRED = "expired"


class TurnRole(str, Enum):
    INTERVIEWER = "interviewer"
    CANDIDATE = "candidate"


class TurnKind(str, Enum):
    OPENING = "opening"
    QUESTION = "question"
    FOLLOWUP = "followup"
    ANSWER = "answer"
    CLOSING = "closing"


class Interview(Base):
    """An AI interview for one scored candidate-job pair.

    Self-contained by design: question_script and grounding are snapshotted at
    creation because candidate_evaluations rows are overwritten in place on
    re-evaluation. The engine, follow-ups, and assessment read nothing outside
    this row and its turns.
    """

    __tablename__ = "interviews"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)

    # One interview per evaluation — also the first line of anti-restart defense.
    evaluation_id: Mapped[UUID] = mapped_column(
        ForeignKey("candidate_evaluations.id", ondelete="CASCADE"),
        unique=True,
        index=True,
    )

    # Public access — the token is the candidate's identity, as in EvaluationRun.
    access_token: Mapped[str] = mapped_column(String(64), unique=True, index=True)

    status: Mapped[str] = mapped_column(
        String(20), default=InterviewStatus.CREATED.value
    )

    # Frozen at creation: InterviewScript.model_dump()
    question_script: Mapped[dict[str, Any]] = mapped_column(JSONB)
    # Snapshot of everything generation and assessment read (job, resume, gaps)
    grounding: Mapped[dict[str, Any]] = mapped_column(JSONB)

    # Audit: which model generated, asks, and assesses
    model_name: Mapped[str] = mapped_column(String(100))

    # Progress state. Invariant: only ever updated in the same commit that
    # inserts the corresponding turn row (see InterviewRepository).
    current_question_index: Mapped[int] = mapped_column(default=0)
    followup_asked: Mapped[bool] = mapped_column(default=False)
    last_seq: Mapped[int] = mapped_column(default=0)

    expires_at: Mapped[datetime]
    started_at: Mapped[datetime | None] = mapped_column(default=None)
    completed_at: Mapped[datetime | None] = mapped_column(default=None)
    assessed_at: Mapped[datetime | None] = mapped_column(default=None)

    # InterviewAssessment.model_dump(); assessment_error set if the task failed
    assessment: Mapped[dict[str, Any] | None] = mapped_column(JSONB, default=None)
    assessment_error: Mapped[str | None] = mapped_column(Text, default=None)

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    # Relationships
    evaluation: Mapped["CandidateEvaluation"] = relationship()
    turns: Mapped[list["InterviewTurn"]] = relationship(
        back_populates="interview",
        cascade="all, delete-orphan",
        order_by="InterviewTurn.seq",
    )

    def __repr__(self) -> str:
        return (
            f"<Interview(id={self.id}, evaluation_id={self.evaluation_id}, "
            f"status={self.status})>"
        )


class InterviewTurn(Base):
    """One turn of the transcript. Append-only: never updated, never deleted.

    This is also the audit trail the hiring-AI regulatory exposure calls for.
    Content is ALWAYS text, which is what keeps the voice swap (Phase 2) from
    touching this table.
    """

    __tablename__ = "interview_turns"

    __table_args__ = (
        UniqueConstraint("interview_id", "seq", name="uq_interview_turn_seq"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    interview_id: Mapped[UUID] = mapped_column(
        ForeignKey("interviews.id", ondelete="CASCADE"), index=True
    )

    seq: Mapped[int]  # 1-based, unique within an interview
    role: Mapped[str] = mapped_column(String(12))  # TurnRole
    kind: Mapped[str] = mapped_column(String(20))  # TurnKind
    question_index: Mapped[int | None] = mapped_column(default=None)
    content: Mapped[str] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    # Relationships
    interview: Mapped["Interview"] = relationship(back_populates="turns")

    def __repr__(self) -> str:
        return (
            f"<InterviewTurn(interview_id={self.interview_id}, seq={self.seq}, "
            f"role={self.role}, kind={self.kind})>"
        )

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class InterviewTemplate(Base):
    """Structural settings shared by every interview generated from one run.

    Pinned to the run rather than the job because the UI creates one job per
    run today; the FK is the only thing that moves if that stops being true,
    which is why this is its own table rather than columns on evaluation_runs.

    Deliberately NOT frozen once interviews exist. Each interview snapshots
    what it needs at approval -- question_script, answer_mode, voice_mode,
    followups_enabled -- so editing this can never reach a live interview. What
    the template equalizes across candidates is structure, not wording: the
    questions themselves are generated per resume and were never identical.
    """

    __tablename__ = "interview_templates"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)

    evaluation_run_id: Mapped[UUID] = mapped_column(
        ForeignKey("evaluation_runs.id", ondelete="CASCADE"),
        unique=True,
        index=True,
    )

    # Total questions asked, fixed ones included. Bounded by
    # MIN/MAX_QUESTIONS_PER_INTERVIEW at the service layer.
    question_count: Mapped[int]

    # Whether the engine may ask an adaptive follow-up at all. A toggle, not a
    # count: the <=1-per-question cap stays MAX_FOLLOWUPS_PER_QUESTION.
    followups_enabled: Mapped[bool] = mapped_column(default=True)

    # NULL means "let the model write it", which is what keeps the template
    # skippable -- a recruiter who only cares about question count never has
    # to draft greeting copy.
    opening: Mapped[str | None] = mapped_column(Text, default=None)
    closing: Mapped[str | None] = mapped_column(Text, default=None)

    # list[FixedQuestion]: {text, focus, subject}. Asked verbatim of every
    # candidate and counted toward question_count, because a fixed question
    # costs the same TTS, transcription and assessment as a generated one.
    fixed_questions: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )

    def __repr__(self) -> str:
        return (
            f"<InterviewTemplate(id={self.id}, run_id={self.evaluation_run_id}, "
            f"question_count={self.question_count})>"
        )

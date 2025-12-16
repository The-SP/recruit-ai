from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.candidate import Candidate
    from app.models.job import Job


class CandidateEvaluation(Base):
    __tablename__ = "candidate_evaluations"

    # Prevent duplicate evaluations for the same candidate-job pair
    __table_args__ = (
        UniqueConstraint("candidate_id", "job_id", name="uq_candidate_job"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    candidate_id: Mapped[UUID] = mapped_column(
        ForeignKey("candidates.id", ondelete="CASCADE")
    )
    job_id: Mapped[UUID] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"))

    # Scores
    skill_score: Mapped[float | None]
    experience_score: Mapped[float | None]
    education_score: Mapped[float | None]
    final_score: Mapped[float | None]

    # Signal: strong_match, good_match, partial_match, weak_match, no_match
    hire_signal: Mapped[str | None] = mapped_column(String(50))

    # Detailed results
    skill_result: Mapped[dict | None] = mapped_column(JSONB)
    experience_result: Mapped[dict | None] = mapped_column(JSONB)
    education_result: Mapped[dict | None] = mapped_column(JSONB)

    summary: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    # Relationships
    candidate: Mapped["Candidate"] = relationship(back_populates="evaluations")
    job: Mapped["Job"] = relationship(back_populates="evaluations")

    def __repr__(self) -> str:
        return f"<CandidateEvaluation(candidate={self.candidate_id}, job={self.job_id}, score={self.final_score})>"

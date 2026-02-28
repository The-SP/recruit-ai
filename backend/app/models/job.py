from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import ARRAY, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.evaluation import CandidateEvaluation


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    raw_text: Mapped[str] = mapped_column(Text)

    # Parsing status
    is_valid_jd: Mapped[bool | None]
    document_type: Mapped[str | None] = mapped_column(String(255))

    # Parsed basic info
    title: Mapped[str | None] = mapped_column(String(255))
    company_name: Mapped[str | None] = mapped_column(String(255))
    summary: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=datetime.now
    )

    # Relationships
    requirements: Mapped["JobRequirements | None"] = relationship(
        back_populates="job", uselist=False, cascade="all, delete-orphan"
    )
    evaluations: Mapped[list["CandidateEvaluation"]] = relationship(
        back_populates="job", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Job(id={self.id}, title={self.title})>"


class JobRequirements(Base):
    __tablename__ = "job_requirements"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    job_id: Mapped[UUID] = mapped_column(
        ForeignKey("jobs.id", ondelete="CASCADE"), unique=True
    )

    # Experience requirements
    exp_min_years: Mapped[float | None]
    exp_max_years: Mapped[float | None]
    exp_level: Mapped[str | None] = mapped_column(String(255))
    exp_key_skills: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    exp_key_responsibilities: Mapped[list[str] | None] = mapped_column(ARRAY(Text))

    # Education requirements
    edu_min_degree: Mapped[str | None] = mapped_column(String(255))
    edu_preferred_fields: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    edu_required: Mapped[bool] = mapped_column(default=False)

    # Skills (nested structure)
    skills: Mapped[dict | None] = mapped_column(JSONB)

    # Other requirements
    certifications: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    other_requirements: Mapped[list[str] | None] = mapped_column(ARRAY(Text))

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=datetime.now
    )

    # Relationships
    job: Mapped["Job"] = relationship(back_populates="requirements")

    def __repr__(self) -> str:
        return f"<JobRequirements(job_id={self.job_id})>"

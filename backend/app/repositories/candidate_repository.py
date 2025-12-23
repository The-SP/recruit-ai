from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.logger import init_logger
from app.models.candidate import Candidate
from app.schemas.resume import ResumeResponse

logger = init_logger(__name__)


class CandidateRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(
        self,
        resume: ResumeResponse,
        filename: str | None = None,
        filepath: str | None = None,
    ) -> Candidate:
        """Create a candidate from parsed resume."""
        pi = resume.personal_information
        candidate = Candidate(
            name=pi.name if pi else None,
            email=pi.email if pi else None,
            phone=pi.phone if pi else None,
            resume_markdown=resume.markdown_content,
            resume_filename=filename,
            resume_filepath=filepath,
        )
        self.db.add(candidate)
        self.db.commit()
        self.db.refresh(candidate)
        logger.info(f"Created candidate: id={candidate.id}, name={candidate.name}")
        return candidate

    def get_by_id(self, candidate_id: UUID) -> Candidate | None:
        stmt = select(Candidate).where(Candidate.id == candidate_id)
        return self.db.scalars(stmt).first()

    def get_all(self, limit: int = 10, offset: int = 0) -> list[Candidate]:
        stmt = (
            select(Candidate)
            .order_by(Candidate.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(self.db.scalars(stmt).all())

    def count(self) -> int:
        """Count total candidates."""
        stmt = select(func.count()).select_from(Candidate)
        return self.db.scalar(stmt) or 0

    def delete(self, candidate_id: UUID) -> bool:
        candidate = self.get_by_id(candidate_id)
        if candidate:
            self.db.delete(candidate)
            self.db.commit()
            logger.info(f"Deleted candidate: id={candidate_id}")
            return True
        return False

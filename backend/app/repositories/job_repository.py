from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.core.logger import init_logger
from app.models.job import Job, JobRequirements
from app.schemas.job_description import JobDescriptionResponse

logger = init_logger(__name__)


class JobRepository:
    def __init__(self, db: Session):
        self.db = db

    @staticmethod
    def _build_skills_jsonb(jd: JobDescriptionResponse) -> dict[str, Any] | None:
        """Convert SkillRequirements to JSONB-compatible dict"""
        if not jd.requirements or not jd.requirements.skills:
            return None

        skills = jd.requirements.skills
        return {
            "critical": [g.model_dump() for g in skills.critical]
            if skills.critical
            else [],
            "required": [g.model_dump() for g in skills.required]
            if skills.required
            else [],
            "preferred": [g.model_dump() for g in skills.preferred]
            if skills.preferred
            else [],
        }

    def create(
        self, jd: JobDescriptionResponse, raw_text: str, user_id: UUID | None = None
    ) -> Job:
        """
        Store a parsed job description to the database.

        Args:
            jd: Parsed job description response
            raw_text: Original raw text of the job description

        Returns:
            Created Job instance with requirements
        """
        logger.info(f"Creating job: {jd.job_title or 'Unknown'}")

        job = Job(
            raw_text=raw_text,
            is_valid_jd=jd.is_job_description,
            document_type=jd.document_type,
            title=jd.job_title,
            company_name=jd.company_name
            if jd.company_name and jd.company_name.lower() != "null"
            else None,
            summary=jd.summary,
            user_id=user_id,
        )

        self.db.add(job)
        self.db.flush()

        if jd.is_job_description and jd.requirements:
            req = jd.requirements
            exp = req.experience
            edu = req.education

            job_requirements = JobRequirements(
                job_id=job.id,
                exp_min_years=exp.min_years if exp else None,
                exp_max_years=exp.max_years if exp else None,
                exp_level=exp.level if exp else None,
                exp_key_skills=exp.key_skills if exp else None,
                exp_key_responsibilities=exp.key_responsibilities if exp else None,
                edu_min_degree=edu.min_degree if edu else None,
                edu_preferred_fields=edu.preferred_fields if edu else None,
                edu_required=edu.required if edu else False,
                skills=self._build_skills_jsonb(jd),
            )
            self.db.add(job_requirements)

        self.db.commit()
        self.db.refresh(job)

        logger.info(f"Created job with id={job.id}")
        return job

    def get_by_id(self, job_id: UUID, with_requirements: bool = False) -> Job | None:
        """Retrieve a job by ID"""
        stmt = select(Job).where(Job.id == job_id)
        if with_requirements:
            stmt = stmt.options(joinedload(Job.requirements))
        return self.db.scalars(stmt).first()

    def get_all(self, limit: int = 10, offset: int = 0) -> list[Job]:
        """Retrieve all jobs with pagination"""
        stmt = select(Job).order_by(Job.created_at.desc()).offset(offset).limit(limit)
        return list(self.db.scalars(stmt).all())

    def delete(self, job_id: UUID) -> bool:
        """Delete a job by ID"""
        job = self.get_by_id(job_id)
        if job:
            self.db.delete(job)
            self.db.commit()
            logger.info(f"Deleted job with id={job_id}")
            return True
        return False

    def count(self) -> int:
        """Count total jobs"""
        stmt = select(func.count()).select_from(Job)
        return self.db.scalar(stmt) or 0

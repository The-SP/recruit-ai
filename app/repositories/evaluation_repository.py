from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.logger import init_logger
from app.models.evaluation import CandidateEvaluation
from app.schemas.composite_evaluation import CompositeScoreResult

logger = init_logger(__name__)


class EvaluationRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(
        self, candidate_id: UUID, job_id: UUID, result: CompositeScoreResult
    ) -> CandidateEvaluation:
        """Store evaluation result for a candidate-job pair"""
        evaluation = CandidateEvaluation(
            candidate_id=candidate_id,
            job_id=job_id,
            skill_score=result.skill_score,
            experience_score=result.experience_score,
            education_score=result.education_score,
            final_score=result.final_score,
            hire_signal=result.hire_signal.value,
            skill_result=result.skill_result.model_dump()
            if result.skill_result
            else None,
            experience_result=result.experience_result.model_dump()
            if result.experience_result
            else None,
            education_result=result.education_result.model_dump()
            if result.education_result
            else None,
            summary=result.summary,
        )
        self.db.add(evaluation)
        self.db.commit()
        self.db.refresh(evaluation)
        logger.info(
            f"Created evaluation: candidate={candidate_id}, job={job_id}, score={result.final_score}"
        )
        return evaluation

    def get_by_id(self, evaluation_id: UUID) -> CandidateEvaluation | None:
        stmt = select(CandidateEvaluation).where(
            CandidateEvaluation.id == evaluation_id
        )
        return self.db.scalars(stmt).first()

    def get_by_candidate(self, candidate_id: UUID) -> list[CandidateEvaluation]:
        stmt = (
            select(CandidateEvaluation)
            .where(CandidateEvaluation.candidate_id == candidate_id)
            .order_by(CandidateEvaluation.created_at.desc())
        )
        return list(self.db.scalars(stmt).all())

    def get_by_job(self, job_id: UUID, limit: int = 50) -> list[CandidateEvaluation]:
        """Get all evaluations for a job, ranked by score"""
        stmt = (
            select(CandidateEvaluation)
            .where(CandidateEvaluation.job_id == job_id)
            .order_by(CandidateEvaluation.final_score.desc().nulls_last())
            .limit(limit)
        )
        return list(self.db.scalars(stmt).all())

    def get_by_candidate_and_job(
        self, candidate_id: UUID, job_id: UUID
    ) -> CandidateEvaluation | None:
        stmt = select(CandidateEvaluation).where(
            CandidateEvaluation.candidate_id == candidate_id,
            CandidateEvaluation.job_id == job_id,
        )
        return self.db.scalars(stmt).first()

    def upsert(
        self, candidate_id: UUID, job_id: UUID, result: CompositeScoreResult
    ) -> CandidateEvaluation:
        """Create or update evaluation for a candidate-job pair"""
        existing = self.get_by_candidate_and_job(candidate_id, job_id)
        if existing:
            existing.skill_score = result.skill_score
            existing.experience_score = result.experience_score
            existing.education_score = result.education_score
            existing.final_score = result.final_score
            existing.hire_signal = result.hire_signal.value
            existing.skill_result = (
                result.skill_result.model_dump() if result.skill_result else None
            )
            existing.experience_result = (
                result.experience_result.model_dump()
                if result.experience_result
                else None
            )
            existing.education_result = (
                result.education_result.model_dump()
                if result.education_result
                else None
            )
            existing.summary = result.summary
            self.db.commit()
            self.db.refresh(existing)
            logger.info(f"Updated evaluation: candidate={candidate_id}, job={job_id}")
            return existing
        return self.create(candidate_id, job_id, result)

    def delete(self, evaluation_id: UUID) -> bool:
        evaluation = self.get_by_id(evaluation_id)
        if evaluation:
            self.db.delete(evaluation)
            self.db.commit()
            logger.info(f"Deleted evaluation: id={evaluation_id}")
            return True
        return False

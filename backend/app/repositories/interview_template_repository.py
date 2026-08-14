from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.logger import init_logger
from app.models.interview_template import InterviewTemplate

logger = init_logger(__name__)


class InterviewTemplateRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_run_id(self, run_id: UUID) -> InterviewTemplate | None:
        return self.db.scalars(
            select(InterviewTemplate).where(
                InterviewTemplate.evaluation_run_id == run_id
            )
        ).first()

    def upsert(
        self,
        run_id: UUID,
        question_count: int,
        followups_enabled: bool,
        opening: str | None,
        closing: str | None,
        fixed_questions: list[dict[str, Any]],
    ) -> InterviewTemplate:
        """Create or replace the run's template.

        Upsert rather than create+update because there is at most one template
        per run (the unique index) and the recruiter experiences it as one
        editable object, not as a thing that has to be created before it can
        be changed.
        """
        template = self.get_by_run_id(run_id)

        if template is None:
            template = InterviewTemplate(evaluation_run_id=run_id)
            self.db.add(template)

        template.question_count = question_count
        template.followups_enabled = followups_enabled
        template.opening = opening
        template.closing = closing
        template.fixed_questions = fixed_questions

        self.db.commit()
        self.db.refresh(template)
        logger.info(
            f"Saved interview template: run_id={run_id} "
            f"question_count={question_count} fixed={len(fixed_questions)}"
        )
        return template

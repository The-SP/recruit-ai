from pydantic import BaseModel, Field

from app.models.education_evaluation import EducationScoreResult
from app.models.experience_evaluation import ExperienceScoreResult
from app.models.skill_evaluation import HireSignal, SkillScoreResult


class CompositeScoreResult(BaseModel):
    """Final composite scoring result"""

    final_score: float | None = Field(None, ge=0.0, le=1.0)
    hire_signal: HireSignal

    skill_score: float | None = None
    experience_score: float | None = None
    education_score: float | None = None

    weights_used: dict[str, float]
    active_components: list[str]

    skill_result: SkillScoreResult | None = None
    experience_result: ExperienceScoreResult | None = None
    education_result: EducationScoreResult | None = None

    summary: str

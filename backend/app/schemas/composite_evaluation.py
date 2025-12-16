from enum import Enum

from pydantic import BaseModel, Field

from app.schemas.education_evaluation import EducationScoreResult
from app.schemas.experience_evaluation import ExperienceScoreResult
from app.schemas.skill_evaluation import SkillScoreResult


class HireSignal(str, Enum):
    """Overall hiring recommendation based on score"""

    STRONG_MATCH = "strong_match"
    GOOD_MATCH = "good_match"
    PARTIAL_MATCH = "partial_match"
    WEAK_MATCH = "weak_match"
    NO_MATCH = "no_match"
    UNDETERMINED = "undetermined"


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

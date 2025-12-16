from enum import Enum

from pydantic import BaseModel, Field


class ExperienceRelevance(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    NONE = "none"


class ExperienceEvaluation(BaseModel):
    job_title: str
    company: str | None = None
    start_date: str = Field(description="Format: YYYY-MM (e.g., 2024-05)")
    end_date: str | None = Field(
        None, description="Format: YYYY-MM or null if current/present"
    )
    duration_months: int = Field(default=0, description="Computed from dates")
    relevance: ExperienceRelevance
    evidence: str = Field(description="Brief justification for relevance rating")


class LLMExperienceResponse(BaseModel):
    """LLM response for experience evaluation"""

    evaluations: list[ExperienceEvaluation]
    notes: str | None = Field(default=None, description="Any additional observations")


class ExperienceScoreResult(BaseModel):
    """Final experience score result"""

    llm_response: LLMExperienceResponse
    effective_months: float
    effective_years: float
    required_years: float
    experience_score: float
    summary: str

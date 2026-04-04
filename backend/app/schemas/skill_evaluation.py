from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class MatchType(str, Enum):
    """Classification of how well a candidate skill matches a job requirement"""

    EXACT = "exact"  # Skill explicitly present
    PARTIAL = "partial"  # Related or equivalent skill present
    NONE = "none"  # No evidence


class SkillGroupEvaluation(BaseModel):
    """LLM evaluation for a single skill group"""

    skill_options: list[str] = Field(
        description="The skill options from job requirements, e.g., ['Django', 'FastAPI', 'Flask']"
    )
    tier: Literal["critical", "required", "preferred"]
    match_type: MatchType
    matched_by: str | None = Field(
        None, description="Which candidate skill/experience matched"
    )
    evidence: str = Field(description="Quote or reference from resume")
    reasoning: str = Field(description="1-2 sentence explanation for HR")


class LLMEvaluationResponse(BaseModel):
    """Schema for LLM evaluation output"""

    evaluations: list[SkillGroupEvaluation]
    strengths: list[str] = Field(description="Skills where candidate excels")


class SkillScoreResult(BaseModel):
    """Final scoring result with all details"""

    # LLM output (contains evaluations, strengths)
    llm_response: LLMEvaluationResponse

    # Computed scores
    required_score: float = Field(ge=0.0, le=1.0)
    preferred_score: float = Field(ge=0.0, le=1.0)

    # Critical gate
    critical_gaps: list[str]
    critical_penalty: float = Field(ge=0.0, le=1.0)

    # Final result
    final_score: float = Field(ge=0.0, le=1.0)
    summary: str

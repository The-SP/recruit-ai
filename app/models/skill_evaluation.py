from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class MatchType(str, Enum):
    """Classification of how well a candidate skill matches a job requirement"""

    EXACT = "exact"  # Skill explicitly present
    EQUIVALENT = "equivalent"  # Different name, same capability
    TRANSFERABLE = "transferable"  # Related skill, knowledge transfers
    FOUNDATIONAL = "foundational"  # Has prerequisites, can learn quickly
    NONE = "none"  # No evidence


class HireSignal(str, Enum):
    """Overall hiring recommendation based on score"""

    STRONG_MATCH = "strong_match"
    GOOD_MATCH = "good_match"
    PARTIAL_MATCH = "partial_match"
    WEAK_MATCH = "weak_match"
    NO_MATCH = "no_match"
    UNDETERMINED = "undetermined"


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
    development_areas: list[str] = Field(
        description="Skills that could be improved or are missing"
    )


class SkillScoreResult(BaseModel):
    """Final scoring result with all details"""

    # LLM output (contains evaluations, strengths, development_areas)
    llm_response: LLMEvaluationResponse

    # Computed scores
    required_score: float = Field(ge=0.0, le=1.0)
    preferred_score: float = Field(ge=0.0, le=1.0)

    # Critical gate
    critical_gaps: list[str]
    critical_penalty: float = Field(ge=0.0, le=1.0)

    # Final result
    final_score: float = Field(ge=0.0, le=1.0)
    hire_signal: HireSignal
    summary: str

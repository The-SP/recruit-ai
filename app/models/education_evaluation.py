from pydantic import BaseModel, Field


class EducationScoreResult(BaseModel):
    """Education evaluation result from LLM"""

    score: float = Field(ge=0.0, le=1.0, description="Education match score 0.0-1.0")
    candidate_degree: str | None = Field(None, description="Highest degree found")
    field_of_study: str | None = Field(None, description="Primary field of study")
    summary: str = Field(description="Brief explanation of the score")

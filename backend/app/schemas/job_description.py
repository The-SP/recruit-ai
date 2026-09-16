from typing import Literal

from pydantic import BaseModel, Field


class ExperienceRequirement(BaseModel):
    min_years: float | None = None
    max_years: float | None = None
    level: str | None = Field(None, description="e.g., Entry, Mid, Senior, Lead")
    key_skills: list[str] | None = Field(
        None, description="Critical and required skill names for context"
    )
    key_responsibilities: list[str] | None = Field(
        None, description="Most essential job responsibilities (max 5)"
    )


class EducationRequirement(BaseModel):
    min_degree: str | None = Field(
        None,
        description=(
            "Minimum degree explicitly stated in the job description, normalized to "
            "'bachelors', 'masters', or 'phd'. Null when no degree is mentioned; "
            "never infer a degree from the role."
        ),
    )
    preferred_fields: list[str] | None = Field(
        None,
        description=(
            "Fields of study explicitly mentioned in the job description. Null when "
            "no field of study is mentioned; never infer fields from the role."
        ),
    )
    required: bool = Field(
        default=False,
        description=(
            "True only when the job description explicitly makes education or a degree "
            "mandatory. False when education is preferred, optional, or not mentioned."
        ),
    )


class SkillGroup(BaseModel):
    """A group of alternative skills where matching ANY one satisfies the requirement"""

    options: list[str] = Field(
        description="Alternative skills - candidate needs any ONE of these"
    )
    min_years: int | None = Field(
        None, description="Minimum years of experience for this skill"
    )
    min_proficiency: (
        Literal["beginner", "intermediate", "advanced", "expert"] | None
    ) = Field(None, description="Minimum proficiency level required")


class SkillRequirements(BaseModel):
    """Three-tier skill requirements with alternative groupings"""

    critical: list[SkillGroup] = Field(
        default_factory=list,
        description="Dealbreaker skills - missing these disqualifies candidate",
    )
    required: list[SkillGroup] = Field(
        default_factory=list,
        description="Important skills - weighted heavily in scoring",
    )
    preferred: list[SkillGroup] = Field(
        default_factory=list,
        description="Nice to have skills - bonus points only",
    )


class JobRequirementsSchema(BaseModel):
    education: EducationRequirement | None = Field(
        None,
        description=(
            "Education requirements explicitly stated in the job description. Null "
            "when no education requirement is mentioned; never infer education from "
            "the role."
        ),
    )
    experience: ExperienceRequirement | None = Field(
        None,
        description="Experience requirements. Always populate when years or seniority level are mentioned.",
    )
    skills: SkillRequirements = Field(
        description="Skill requirements grouped by tier. Always populate — use empty lists for tiers with no skills."
    )


class JobDescriptionResponse(BaseModel):
    """Response schema for job description parsing"""

    is_job_description: bool
    document_type: str | None = Field(
        None,
        description="Short label for what the document is. Null if is_job_description is true.",
    )

    # Basic Information
    job_title: str | None = None
    company_name: str | None = None

    # Role Details
    summary: str | None = Field(None, description="Brief overview of the role")
    requirements: JobRequirementsSchema = Field(
        description="All structured requirements extracted from the job description. Always populate this for job descriptions — never leave null.",
    )

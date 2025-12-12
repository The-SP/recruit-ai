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
        description="Minimum degree: 'bachelors', 'masters', 'phd'",
    )
    preferred_fields: list[str] | None = Field(
        None, description="Preferred fields of study"
    )
    required: bool = Field(
        default=False,
        description="Whether education is a hard requirement for this role",
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


class JobRequirements(BaseModel):
    education: EducationRequirement | None = None
    experience: ExperienceRequirement | None = None
    skills: SkillRequirements | None = None
    certifications: list[str] | None = None
    other_requirements: list[str] | None = None


class JobDescriptionResponse(BaseModel):
    """Response schema for job description parsing"""

    is_job_description: bool
    document_type: str | None = Field(None, description="Only if not a job description")

    # Basic Information
    job_title: str | None = None
    company_name: str | None = None

    # Role Details
    summary: str | None = Field(None, description="Brief overview of the role")
    responsibilities: list[str] | None = None
    requirements: JobRequirements | None = None

    # For matching purposes
    keywords: list[str] | None = Field(
        None, description="Key terms extracted for matching"
    )

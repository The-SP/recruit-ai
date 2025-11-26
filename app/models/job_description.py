from pydantic import BaseModel, Field


class ExperienceRequirement(BaseModel):
    min_years: int | None = None
    max_years: int | None = None
    level: str | None = Field(None, description="e.g., Entry, Mid, Senior, Lead")
    specific_experience: list[str] | None = Field(
        None, description="Specific types of experience required"
    )


class EducationRequirement(BaseModel):
    degree_level: str | None = Field(None, description="e.g., Bachelor, Master, PhD")
    fields_of_study: list[str] | None = None
    is_required: bool = True
    equivalent_experience_accepted: bool = False


class SkillRequirement(BaseModel):
    name: str
    proficiency_level: str | None = Field(
        None, description="e.g., Beginner, Intermediate, Expert"
    )
    is_required: bool = True
    years_of_experience: int | None = None


class JobRequirements(BaseModel):
    education: list[EducationRequirement] | None = None
    experience: ExperienceRequirement | None = None
    required_skills: list[SkillRequirement] | None = None
    preferred_skills: list[SkillRequirement] | None = None
    certifications: list[str] | None = None
    languages: list[str] | None = Field(None, description="Spoken/written languages")
    other_requirements: list[str] | None = None


class JobDescriptionResponse(BaseModel):
    """Response schema for job description parsing"""

    is_job_description: bool
    document_type: str | None = Field(None, description="Only if not a job description")

    # Basic Information
    job_title: str | None = None
    company_name: str | None = None
    department: str | None = None
    location: str | None = None
    remote_policy: str | None = Field(None, description="Remote, Hybrid, On-site")
    employment_type: str | None = Field(
        None, description="Full-time, Part-time, Contract"
    )

    # Role Details
    summary: str | None = Field(None, description="Brief overview of the role")
    responsibilities: list[str] | None = None
    requirements: JobRequirements | None = None

    # For matching purposes
    keywords: list[str] | None = Field(
        None, description="Key terms extracted for matching"
    )

from pydantic import BaseModel, Field


class PersonalInformation(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    location: str | None = None
    linkedin: str | None = None
    github: str | None = None
    portfolio: str | None = None
    other_links: list[str] | None = None


class WorkExperience(BaseModel):
    job_title: str | None = None
    company_name: str | None = None
    location: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    duration: str | None = None
    responsibilities: list[str] | None = None


class Education(BaseModel):
    degree: str | None = None
    field_of_study: str | None = None
    institution: str | None = None
    location: str | None = None
    graduation_date: str | None = None
    gpa: str | None = None
    honors: str | None = None
    relevant_coursework: list[str] | None = None


class Skills(BaseModel):
    technical_skills: list[str] | None = None
    soft_skills: list[str] | None = None
    languages: list[str] | None = None
    tools_and_technologies: list[str] | None = None
    certifications: list[str] | None = None


class Project(BaseModel):
    project_name: str | None = None
    description: str | None = None
    technologies_used: list[str] | None = None
    date: str | None = None
    link: str | None = None


class Certification(BaseModel):
    name: str | None = None
    issuing_organization: str | None = None
    date_obtained: str | None = None
    expiry_date: str | None = None
    credential_id: str | None = None


class Award(BaseModel):
    title: str | None = None
    issuer: str | None = None
    date: str | None = None
    description: str | None = None


class Publication(BaseModel):
    title: str | None = None
    authors: str | None = None
    publication_venue: str | None = None
    date: str | None = None
    link: str | None = None


class VolunteerExperience(BaseModel):
    role: str | None = None
    organization: str | None = None
    duration: str | None = None
    description: str | None = None


class ResumeResponse(BaseModel):
    """Response schema for resume parsing"""

    is_resume: bool
    document_type: str | None = Field(None, description="Only if not a resume")

    # Markdown content for scoring (preserves full context)
    markdown_content: str | None = Field(
        None,
        description="Clean markdown representation of the entire resume for scoring purposes",
    )

    # Structured sections for storage/search/filtering
    personal_information: PersonalInformation | None = None
    professional_summary: str | None = None
    work_experience: list[WorkExperience] | None = None
    education: list[Education] | None = None
    skills: Skills | None = None
    projects: list[Project] | None = None
    certifications_and_licenses: list[Certification] | None = None
    awards_and_honors: list[Award] | None = None
    publications: list[Publication] | None = None
    volunteer_experience: list[VolunteerExperience] | None = None
    additional_sections: dict[str, str] | None = None

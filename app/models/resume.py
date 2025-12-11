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


class ResumeResponse(BaseModel):
    """Response schema for resume parsing"""

    is_resume: bool
    document_type: str | None = Field(
        None, description="Brief description if not a resume (max 15 words)"
    )

    personal_information: PersonalInformation | None = None

    markdown_content: str | None = Field(
        None,
        description="Full resume converted to clean markdown format",
    )

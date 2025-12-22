from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class CandidateResponse(BaseModel):
    """Response for a single candidate."""

    id: UUID
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    resume_filename: str | None = None
    resume_filepath: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CandidateListResponse(BaseModel):
    """Paginated list of candidates."""

    items: list[CandidateResponse]
    total: int
    limit: int
    offset: int

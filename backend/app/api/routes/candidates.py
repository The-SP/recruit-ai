import os
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.api.dependencies import get_db
from app.api.exceptions import NotFoundError, ValidationError
from app.api.schemas.candidates import CandidateListResponse, CandidateResponse
from app.core.resume_parser import parse_resume
from app.repositories.candidate_repository import CandidateRepository

router = APIRouter(prefix="/candidates", tags=["candidates"])

UPLOAD_DIR = Path("data/uploads")


@router.post("", response_model=CandidateResponse, status_code=201)
async def create_candidate(
    file: UploadFile, db: Session = Depends(get_db)
) -> CandidateResponse:
    """Upload a resume PDF and create a candidate."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise ValidationError("File must be a PDF")

    # Ensure upload directory exists
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    # Save uploaded file
    filepath = UPLOAD_DIR / file.filename
    try:
        content = await file.read()
        with open(filepath, "wb") as f:
            f.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {e}")

    # Parse resume
    try:
        resume = parse_resume(str(filepath))
    except Exception as e:
        # Clean up file on parse failure
        if filepath.exists():
            os.remove(filepath)
        raise ValidationError(f"Failed to parse resume: {e}")

    if not resume.is_resume:
        # Clean up file if not a valid resume
        if filepath.exists():
            os.remove(filepath)
        raise ValidationError(
            f"Document is not a valid resume. Detected: {resume.document_type}"
        )

    # Create candidate
    repo = CandidateRepository(db)
    candidate = repo.create(
        resume=resume,
        filename=file.filename,
        filepath=str(filepath),
    )

    return CandidateResponse.model_validate(candidate)


@router.get("/{candidate_id}", response_model=CandidateResponse)
def get_candidate(
    candidate_id: UUID, db: Session = Depends(get_db)
) -> CandidateResponse:
    """Get a candidate by ID."""
    repo = CandidateRepository(db)
    candidate = repo.get_by_id(candidate_id)

    if not candidate:
        raise NotFoundError("Candidate", str(candidate_id))

    return CandidateResponse.model_validate(candidate)


@router.get("", response_model=CandidateListResponse)
def list_candidates(
    limit: int = Query(default=10, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> CandidateListResponse:
    """List candidates with pagination."""
    repo = CandidateRepository(db)
    candidates = repo.get_all(limit=limit, offset=offset)
    total = repo.count()

    return CandidateListResponse(
        items=[CandidateResponse.model_validate(c) for c in candidates],
        total=total,
        limit=limit,
        offset=offset,
    )

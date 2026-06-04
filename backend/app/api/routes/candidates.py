from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Query, UploadFile
from sqlalchemy.orm import Session

from app.api.dependencies import get_db
from app.api.exceptions import NotFoundError, ValidationError
from app.api.schemas.candidates import CandidateListResponse, CandidateResponse
from app.core.file_storage import delete_file, save_uploaded_file
from app.core.file_upload import read_pdf_content, validate_pdf_filename
from app.core.resume_parser import parse_resume
from app.repositories.candidate_repository import CandidateRepository

router = APIRouter(prefix="/candidates", tags=["candidates"])

STANDALONE_UPLOAD_DIR = "data/uploads/standalone"


@router.post("", response_model=CandidateResponse, status_code=201)
async def create_candidate(
    file: UploadFile, db: Session = Depends(get_db)
) -> CandidateResponse:
    """Upload a resume PDF and create a candidate."""
    filename = validate_pdf_filename(file.filename)
    content, _ = await read_pdf_content(file)

    # Save uploaded file
    unique_filename = f"{uuid4()}_{filename}"
    file_path = save_uploaded_file(STANDALONE_UPLOAD_DIR, unique_filename, content)

    try:
        resume = parse_resume(file_path)
    except Exception as e:
        delete_file(file_path)
        raise ValidationError(f"Failed to parse resume: {e}")

    if not resume.is_resume:
        delete_file(file_path)
        raise ValidationError(
            f"Document is not a valid resume. Detected: {resume.document_type}"
        )

    # Create candidate
    repo = CandidateRepository(db)
    candidate = repo.create(
        resume=resume,
        filename=filename,
        filepath=file_path,
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

"""
Common utilities for file uploads.
"""

import math
from pathlib import Path
from uuid import UUID

from fastapi import UploadFile

from app.api.exceptions import ValidationError

# The anonymous batch flow is a trial surface, not a workspace: it exists to show
# that ranking works on a handful of resumes. Signed-in runs are uncapped.
MAX_ANONYMOUS_RESUMES = 5


def enforce_anonymous_resume_cap(existing_count: int, incoming_count: int) -> None:
    """Reject an anonymous upload that would push a run past the trial cap.

    Must be called *before* the per-file upload loop. The loops (and
    `process_uploaded_files` below) catch ValidationError per file and fold it
    into an `errors` list, so a cap raised inside one would be silently
    downgraded to a per-file warning instead of failing the request.
    """
    if existing_count + incoming_count <= MAX_ANONYMOUS_RESUMES:
        return

    remaining = max(0, MAX_ANONYMOUS_RESUMES - existing_count)
    if not existing_count:
        detail = f"You tried to upload {incoming_count}."
    elif remaining:
        detail = (
            f"This evaluation already has {existing_count}, so you can add "
            f"{remaining} more."
        )
    else:
        detail = f"This evaluation already has {existing_count}."

    raise ValidationError(
        f"Evaluations without an account are limited to "
        f"{MAX_ANONYMOUS_RESUMES} resumes. {detail} "
        "Sign in to evaluate more."
    )


def validate_pdf_filename(filename: str | None) -> str:
    """
    Validate that filename exists and has .pdf extension.

    Args:
        filename: Original filename

    Returns:
        Sanitized filename (basename only, no path components)

    Raises:
        ValidationError: If filename is missing or not PDF
    """
    if not filename:
        raise ValidationError("Filename is required")

    # Strip any path components to prevent directory traversal
    safe_filename = Path(filename).name

    if not safe_filename or safe_filename in (".", ".."):
        raise ValidationError("Invalid filename")

    if not safe_filename.lower().endswith(".pdf"):
        raise ValidationError("File must be a PDF")

    return safe_filename


async def read_pdf_content(file: UploadFile) -> tuple[bytes, int]:
    """
    Read and validate PDF content.

    Args:
        file: FastAPI UploadFile

    Returns:
        Tuple of (content_bytes, file_size_in_kb)

    Raises:
        ValidationError: If content is not valid PDF
    """
    content = await file.read()

    if not content.startswith(b"%PDF"):
        raise ValidationError("File does not appear to be a valid PDF")

    file_size = _bytes_to_kb(len(content))

    return content, file_size


def _bytes_to_kb(size_bytes: int) -> int:
    """Convert bytes to KB, rounding up."""
    return math.ceil(size_bytes / 1024)


async def process_uploaded_files(
    run_id: UUID,
    run_folder_path: str,
    files: list[UploadFile],
    item_repo: "EvaluationRunItemRepository",
    run_repo: "EvaluationRunRepository",
) -> tuple[int, int, list[str]]:
    """
    Validate, save, and register uploaded PDF files for a batch run.

    Returns (uploaded_count, failed_count, error_messages).
    """
    from app.core.file_storage import save_uploaded_file

    uploaded = 0
    failed = 0
    errors: list[str] = []
    duplicate_files: list[str] = []

    for file in files:
        try:
            filename = validate_pdf_filename(file.filename)

            if item_repo.filename_exists(run_id, filename):
                duplicate_files.append(filename)
                failed += 1
                continue

            content, file_size = await read_pdf_content(file)
            save_uploaded_file(run_folder_path, filename, content)
            item_repo.create_uploaded(run_id, filename, file_size)
            run_repo.adjust_total_count(run_id)
            uploaded += 1

        except ValidationError as e:
            errors.append(f"{file.filename or 'unknown'}: {e.message}")
            failed += 1
        except Exception as e:
            errors.append(f"{file.filename or 'unknown'}: {str(e)[:100]}")
            failed += 1

    if duplicate_files:
        errors.append(f"{', '.join(duplicate_files)}: already exists in this batch")

    return uploaded, failed, errors


# Avoid circular imports — these are only used in type hints within the function body
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.repositories.evaluation_run_repository import (
        EvaluationRunItemRepository,
        EvaluationRunRepository,
    )

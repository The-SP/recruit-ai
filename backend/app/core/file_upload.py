"""
Common utilities for file uploads.
"""

import math
from pathlib import Path

from fastapi import UploadFile

from app.api.exceptions import ValidationError


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

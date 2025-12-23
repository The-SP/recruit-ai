"""
File storage utilities for batch uploads.
"""

import shutil
from pathlib import Path
from uuid import UUID

UPLOAD_BASE = Path("data/uploads")


def get_batch_folder(run_id: UUID) -> Path:
    """Get the folder path for a batch run."""
    return UPLOAD_BASE / str(run_id)


def ensure_batch_folder(run_id: UUID) -> Path:
    """Create batch folder if it doesn't exist, return path."""
    folder = get_batch_folder(run_id)
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def save_uploaded_file(run_id: UUID, filename: str, content: bytes) -> Path:
    """Save uploaded file to batch folder. Returns file path."""
    folder = ensure_batch_folder(run_id)
    file_path = folder / filename
    file_path.write_bytes(content)
    return file_path


def get_file_path(run_id: UUID, filename: str) -> Path:
    """Get full path to a file in batch folder."""
    return get_batch_folder(run_id) / filename


def file_exists(run_id: UUID, filename: str) -> bool:
    """Check if file already exists in batch folder."""
    return get_file_path(run_id, filename).exists()


def delete_file(run_id: UUID, filename: str) -> bool:
    """Delete a file from batch folder. Returns True if deleted."""
    file_path = get_file_path(run_id, filename)
    if file_path.exists():
        file_path.unlink()
        return True
    return False


def delete_batch_folder(run_id: UUID) -> bool:
    """Delete entire batch folder. Returns True if deleted."""
    folder = get_batch_folder(run_id)
    if folder.exists():
        shutil.rmtree(folder)
        return True
    return False

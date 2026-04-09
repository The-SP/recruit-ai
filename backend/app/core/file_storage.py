"""
File storage utilities for batch uploads.
"""

import shutil
from pathlib import Path
from uuid import UUID

UPLOAD_BASE = Path("data/uploads")


def ensure_folder(folder_path: str) -> Path:
    """Create folder if it doesn't exist, return path."""
    folder = Path(folder_path)
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def resolve_safe_path(folder: Path, filename: str) -> Path:
    """
    Resolve filename relative to folder, rejecting any path traversal.

    Raises:
        ValueError: If the resolved path escapes the folder.
    """
    resolved = (folder / Path(filename).name).resolve()
    if not resolved.is_relative_to(folder.resolve()):
        raise ValueError("Invalid filename: path traversal detected")
    return resolved


def save_uploaded_file(folder_path: str, filename: str, content: bytes) -> Path:
    """
    Save uploaded file to specified folder.

    Args:
        folder_path: Target folder path
        filename: Filename to save as
        content: File content bytes

    Returns:
        Path to saved file

    Raises:
        ValueError: If resolved path escapes the target folder
    """
    folder = ensure_folder(folder_path)
    file_path = resolve_safe_path(folder, filename)
    file_path.write_bytes(content)
    return file_path


def get_batch_folder(run_id: UUID) -> Path:
    """Get the folder path for a batch run."""
    return UPLOAD_BASE / str(run_id)


def delete_file(run_id: UUID, filename: str) -> bool:
    """Delete a file from batch folder. Returns True if deleted."""
    folder = get_batch_folder(run_id)
    file_path = resolve_safe_path(folder, filename)
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

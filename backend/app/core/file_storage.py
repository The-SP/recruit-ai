"""
File storage utilities for uploaded artifacts: batch resumes and recorded
interview answers. Call sites use this facade, never a backend directly.
"""

from pathlib import Path
from uuid import UUID

from app.config import Config
from app.core.storage.base import BaseStorage
from app.core.storage.local import LocalStorage
from app.core.storage.s3 import S3Storage

UPLOAD_BASE = Path("resumes")
INTERVIEW_AUDIO_BASE = Path("interviews")


def get_storage() -> BaseStorage:
    """Get the configured storage backend."""
    if Config.USE_S3:
        return S3Storage(
            bucket_name=Config.S3_BUCKET_NAME,
            region_name=Config.S3_REGION,
            aws_access_key_id=Config.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=Config.AWS_SECRET_ACCESS_KEY,
        )
    return LocalStorage(base_path=".")


def save_uploaded_file(folder_path: str, filename: str, content: bytes) -> str:
    """
    Save uploaded file to specified folder using the configured backend.

    Returns:
        Reference string to the saved file (path or key).
    """
    storage = get_storage()
    return storage.save(folder_path, filename, content)


def get_file_content(file_path: str) -> bytes:
    """Retrieve file content from the configured backend."""
    storage = get_storage()
    return storage.get(file_path)


def delete_file(file_path: str) -> bool:
    """Delete a file from the configured backend."""
    storage = get_storage()
    return storage.delete(file_path)


def file_exists(file_path: str) -> bool:
    """Whether a file is present on the configured backend."""
    storage = get_storage()
    return storage.exists(file_path)


def ensure_folder(folder_path: str) -> None:
    """Ensure a local folder exists. S3 prefixes are created when files are uploaded."""
    if Config.USE_S3:
        return

    Path(folder_path).mkdir(parents=True, exist_ok=True)


def _delete_folder(folder_path: str) -> bool:
    """Delete every object under a folder/prefix on the configured backend.

    Local storage removes the directory tree in one call; S3 has no folders, so
    the prefix has to be listed and deleted page by page.
    """
    storage = get_storage()

    if not Config.USE_S3:
        return storage.delete(folder_path)

    assert isinstance(storage, S3Storage)

    prefix = folder_path.strip("/")
    if prefix:
        prefix = f"{prefix}/"

    paginator = storage.s3.get_paginator("list_objects_v2")
    deleted_any = False

    for page in paginator.paginate(Bucket=storage.bucket_name, Prefix=prefix):
        objects = [{"Key": obj["Key"]} for obj in page.get("Contents", [])]
        if not objects:
            continue

        storage.s3.delete_objects(
            Bucket=storage.bucket_name,
            Delete={"Objects": objects},
        )
        deleted_any = True

    return deleted_any


def delete_batch_folder(run_id: UUID) -> bool:
    """Delete all stored files for an evaluation run."""
    return _delete_folder(get_batch_folder(run_id))


def delete_interview_audio(interview_id: UUID) -> bool:
    """Delete all recorded answers for an interview.

    Cascade deletes remove interview_turns rows but never storage objects, so
    the one place interviews die with their run calls this explicitly. Orphans
    from entity-level cascades (candidate or job deletion) are accepted, which
    is the existing behavior for resumes too.
    """
    return _delete_folder(get_interview_audio_folder(interview_id))


def get_batch_folder(run_id: UUID) -> str:
    """Get the folder path for a batch run."""
    return str(UPLOAD_BASE / str(run_id))


def get_interview_audio_folder(interview_id: UUID) -> str:
    """Get the folder path for one interview's audio.

    Holds both directions: candidate answer recordings (turn-{seq}.{ext}) and
    synthesized interviewer speech (tts-{key}.wav). One folder on purpose, so
    delete_interview_audio sweeps both.
    """
    return str(INTERVIEW_AUDIO_BASE / str(interview_id))


def resolve_file_path(folder_path: str, filename: str) -> str:
    """Resolve a folder path and filename into a storage path."""
    clean_folder = folder_path.strip("/")
    return f"{clean_folder}/{filename}"

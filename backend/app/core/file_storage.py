"""
File storage utilities for batch uploads.
"""

from pathlib import Path
from uuid import UUID

from app.config import Config
from app.core.storage.base import BaseStorage
from app.core.storage.local import LocalStorage
from app.core.storage.s3 import S3Storage

UPLOAD_BASE = Path("resumes")


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


def ensure_folder(folder_path: str) -> None:
    """Ensure a local folder exists. S3 prefixes are created when files are uploaded."""
    if Config.USE_S3:
        return

    Path(folder_path).mkdir(parents=True, exist_ok=True)


def delete_batch_folder(run_id: UUID) -> bool:
    """Delete all stored files for an evaluation run."""
    storage = get_storage()
    folder_path = get_batch_folder(run_id)

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


def get_batch_folder(run_id: UUID) -> str:
    """Get the folder path for a batch run."""
    return str(UPLOAD_BASE / str(run_id))


def resolve_file_path(folder_path: str, filename: str) -> str:
    """Resolve a folder path and filename into a storage path."""
    clean_folder = folder_path.strip("/")
    return f"{clean_folder}/{filename}"

from typing import Any

import boto3
from botocore.config import Config as BotoConfig

from .base import BaseStorage


class S3Storage(BaseStorage):
    def __init__(
        self,
        bucket_name: str,
        region_name: str,
        aws_access_key_id: str,
        aws_secret_access_key: str,
    ):
        self.bucket_name = bucket_name
        self.s3 = boto3.client(
            "s3",
            region_name=region_name,
            aws_access_key_id=aws_access_key_id,
            aws_secret_access_key=aws_secret_access_key,
            config=BotoConfig(signature_version="s3v4"),
        )

    def _get_key(self, folder_path: str, filename: str) -> str:
        # Normalize folder path for S3 keys (remove leading/trailing slashes)
        clean_folder = folder_path.strip("/")
        return f"{clean_folder}/{filename}"

    def save(self, folder_path: str, filename: str, content: bytes) -> str:
        key = self._get_key(folder_path, filename)
        self.s3.put_object(Bucket=self.bucket_name, Key=key, Body=content)
        return key

    def get(self, file_path: str) -> bytes:
        response = self.s3.get_object(Bucket=self.bucket_name, Key=file_path)
        return response["Body"].read()

    def delete(self, file_path: str) -> bool:
        try:
            # Check if it's a "folder" (prefix) or a single file
            # S3 doesn't have true folders, but we can delete by prefix
            # For now, let's assume it's a file. If it were a folder we'd need to list and delete.
            self.s3.delete_object(Bucket=self.bucket_name, Key=file_path)
            return True
        except Exception:
            return False

    def exists(self, file_path: str) -> bool:
        try:
            self.s3.head_object(Bucket=self.bucket_name, Key=file_path)
            return True
        except Exception:
            return False

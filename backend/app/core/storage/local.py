import shutil
from pathlib import Path

from .base import BaseStorage


class LocalStorage(BaseStorage):
    """Files under base_path, addressed by the same relative keys S3 uses
    (resumes/{run_id}/x.pdf), so stored paths don't depend on the backend."""

    def __init__(self, base_path: str = "data/uploads"):
        self.base_path = Path(base_path)

    def _resolve(self, file_path: str) -> Path:
        """A relative key lives under base_path. Absolute paths pass through:
        rows written before keys were relative stored the full path."""
        path = Path(file_path)
        return path if path.is_absolute() else self.base_path / path

    def _resolve_safe_path(self, folder: Path, filename: str) -> Path:
        """
        Ensure the path is within the base_path and prevent traversal attacks.
        """
        # Use .name to strip any path segments from filename (prevent traversal)
        clean_filename = Path(filename).name

        # Combine and resolve to absolute path
        resolved = (folder / clean_filename).resolve()

        # Jail check: ensure the final path is within base_path
        base_resolved = self.base_path.resolve()
        if not resolved.is_relative_to(base_resolved):
            raise ValueError(
                f"Security error: path {resolved} is outside base storage {base_resolved}"
            )

        return resolved

    def save(self, folder_path: str, filename: str, content: bytes) -> str:
        file_path = self._resolve_safe_path(self._resolve(folder_path), filename)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_bytes(content)
        # Return the key, not the absolute path, matching S3Storage.save
        return str(file_path.relative_to(self.base_path.resolve()))

    def get(self, file_path: str) -> bytes:
        return self._resolve(file_path).read_bytes()

    def delete(self, file_path: str) -> bool:
        path = self._resolve(file_path)
        if path.exists():
            if path.is_dir():
                shutil.rmtree(path)
            else:
                path.unlink()
            return True
        return False

    def exists(self, file_path: str) -> bool:
        return self._resolve(file_path).exists()

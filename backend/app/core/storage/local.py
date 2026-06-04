import shutil
from pathlib import Path

from .base import BaseStorage


class LocalStorage(BaseStorage):
    def __init__(self, base_path: str = "data/uploads"):
        self.base_path = Path(base_path)

    def _ensure_folder(self, folder_path: str) -> Path:
        folder = Path(folder_path)
        folder.mkdir(parents=True, exist_ok=True)
        return folder

    def _resolve_safe_path(self, folder: Path, filename: str) -> Path:
        """
        Ensure the path is within the base_path and prevent traversal attacks.
        """
        # Ensure the directory exists before resolving if we want to be strict,
        # but resolve() works on non-existent paths in modern Python too.

        # Use .name to strip any path segments from filename (prevent traversal)
        clean_filename = Path(filename).name

        # Combine and resolve to absolute path
        resolved = (folder / clean_filename).resolve()

        # Jail check: ensure the final path is within base_path
        base_resolved = self.base_path.resolve()
        if not str(resolved).startswith(str(base_resolved)):
            raise ValueError(
                f"Security error: path {resolved} is outside base storage {base_resolved}"
            )

        return resolved

    def save(self, folder_path: str, filename: str, content: bytes) -> str:
        # If folder_path is relative, make it relative to base_path
        target_folder = Path(folder_path)
        if not target_folder.is_absolute():
            target_folder = self.base_path / target_folder

        file_path = self._resolve_safe_path(target_folder, filename)

        # Ensure the directory exists
        file_path.parent.mkdir(parents=True, exist_ok=True)

        file_path.write_bytes(content)
        return str(file_path)

    def get(self, file_path: str) -> bytes:
        return Path(file_path).read_bytes()

    def delete(self, file_path: str) -> bool:
        path = Path(file_path)
        if path.exists():
            if path.is_dir():
                shutil.rmtree(path)
            else:
                path.unlink()
            return True
        return False

    def exists(self, file_path: str) -> bool:
        return Path(file_path).exists()

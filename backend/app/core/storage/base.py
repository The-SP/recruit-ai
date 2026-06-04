from abc import ABC, abstractmethod
from pathlib import Path


class BaseStorage(ABC):
    @abstractmethod
    def save(self, folder_path: str, filename: str, content: bytes) -> str:
        """
        Save file content and return a reference string (path or key).
        """
        pass

    @abstractmethod
    def get(self, file_path: str) -> bytes:
        """
        Retrieve file content by its storage path.
        """
        pass

    @abstractmethod
    def delete(self, file_path: str) -> bool:
        """
        Delete file by its storage path.
        """
        pass

    @abstractmethod
    def exists(self, file_path: str) -> bool:
        """
        Check if file exists by its storage path.
        """
        pass

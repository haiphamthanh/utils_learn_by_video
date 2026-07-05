from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Callable

ProgressCallback = Callable[[str, int], None]


class TranscriptionProvider(ABC):
    @abstractmethod
    def transcribe(
        self,
        audio_path: Path,
        *,
        model: str,
        language: str | None,
        device: str,
        on_progress: ProgressCallback,
    ) -> dict[str, Any]:
        raise NotImplementedError

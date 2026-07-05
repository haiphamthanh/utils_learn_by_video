from __future__ import annotations

from pathlib import Path
from typing import Any

from .base import ProgressCallback, TranscriptionProvider


class MockTranscriptionProvider(TranscriptionProvider):
    def transcribe(
        self,
        audio_path: Path,
        *,
        model: str,
        language: str | None,
        device: str,
        on_progress: ProgressCallback,
    ) -> dict[str, Any]:
        del audio_path, device
        on_progress("TRANSCRIBE", 50)
        return {
            "language": language or "en",
            "text": "This is a deterministic transcription smoke test.",
            "segments": [
                {
                    "startMs": 0,
                    "endMs": 1800,
                    "text": "This is a deterministic transcription smoke test.",
                    "confidence": 1.0,
                }
            ],
            "provider": "mock",
            "model": model,
        }

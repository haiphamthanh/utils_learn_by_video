from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from .base import ProgressCallback, TranscriptionProvider


class OpenAITranscriptionProvider(TranscriptionProvider):
    def transcribe(
        self,
        audio_path: Path,
        *,
        model: str,
        language: str | None,
        device: str,
        on_progress: ProgressCallback,
    ) -> dict[str, Any]:
        del device

        if not os.environ.get("OPENAI_API_KEY"):
            raise RuntimeError(
                "OPENAI_API_KEY is required when TRANSCRIPTION_PROVIDER=openai."
            )

        try:
            from openai import OpenAI
        except ImportError as exc:
            raise RuntimeError(
                "The OpenAI Python package is not installed. Run ./scripts/setup-python.sh."
            ) from exc

        on_progress("UPLOAD_AUDIO", 20)
        client = OpenAI()

        with audio_path.open("rb") as audio_file:
            on_progress("TRANSCRIBE", 40)
            response = client.audio.transcriptions.create(
                file=audio_file,
                model=model,
                language=language or None,
                response_format="verbose_json",
                timestamp_granularities=["segment"],
            )

        payload = response.model_dump() if hasattr(response, "model_dump") else dict(response)
        segments = []
        for segment in payload.get("segments") or []:
            text = str(segment.get("text", "")).strip()
            if not text:
                continue
            segments.append(
                {
                    "startMs": max(0, round(float(segment.get("start", 0)) * 1000)),
                    "endMs": max(0, round(float(segment.get("end", 0)) * 1000)),
                    "text": text,
                    "confidence": None,
                }
            )

        return {
            "language": str(language or payload.get("language") or "unknown"),
            "text": str(payload.get("text", "")).strip(),
            "segments": segments,
            "provider": "openai",
            "model": model,
        }

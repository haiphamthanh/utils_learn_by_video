from __future__ import annotations

import math
from pathlib import Path
from typing import Any

from .base import ProgressCallback, TranscriptionProvider


class LocalWhisperProvider(TranscriptionProvider):
    def transcribe(
        self,
        audio_path: Path,
        *,
        model: str,
        language: str | None,
        device: str,
        on_progress: ProgressCallback,
    ) -> dict[str, Any]:
        try:
            import whisper
        except ImportError as exc:
            raise RuntimeError(
                "Local Whisper is not installed. Run ./scripts/setup-python.sh."
            ) from exc

        on_progress("LOAD_MODEL", 15)
        whisper_model = whisper.load_model(model, device=device)

        on_progress("TRANSCRIBE", 35)
        result = whisper_model.transcribe(
            str(audio_path),
            language=language or None,
            task="transcribe",
            verbose=False,
            fp16=device == "cuda",
        )

        segments: list[dict[str, Any]] = []
        for segment in result.get("segments", []):
            avg_logprob = segment.get("avg_logprob")
            confidence = None
            if isinstance(avg_logprob, (int, float)):
                confidence = max(0.0, min(1.0, math.exp(avg_logprob)))

            text = str(segment.get("text", "")).strip()
            if not text:
                continue

            segments.append(
                {
                    "startMs": max(0, round(float(segment.get("start", 0)) * 1000)),
                    "endMs": max(0, round(float(segment.get("end", 0)) * 1000)),
                    "text": text,
                    "confidence": confidence,
                }
            )

        return {
            "language": str(language or result.get("language") or "unknown"),
            "text": str(result.get("text", "")).strip(),
            "segments": segments,
            "provider": "local-whisper",
            "model": model,
        }

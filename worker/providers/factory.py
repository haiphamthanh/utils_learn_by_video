from __future__ import annotations

from .base import TranscriptionProvider
from .local_whisper import LocalWhisperProvider
from .mock import MockTranscriptionProvider
from .openai_transcription import OpenAITranscriptionProvider


def create_provider(name: str) -> TranscriptionProvider:
    normalized = name.strip().lower()

    if normalized == "local-whisper":
        return LocalWhisperProvider()
    if normalized == "openai":
        return OpenAITranscriptionProvider()
    if normalized == "mock":
        return MockTranscriptionProvider()

    raise ValueError(f"Unsupported transcription provider: {name}")

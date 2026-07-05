from __future__ import annotations

from .base import LessonProvider


def create_lesson_provider(name: str) -> LessonProvider:
    normalized = name.strip().lower()

    if normalized == "local-basic":
        from .local_basic import LocalBasicLessonProvider
        return LocalBasicLessonProvider()

    if normalized == "openai":
        from .openai_lesson import OpenAILessonProvider
        return OpenAILessonProvider()

    if normalized == "mock":
        from .mock import MockLessonProvider
        return MockLessonProvider()

    raise ValueError(f"Unsupported lesson provider: {name}")

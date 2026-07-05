from __future__ import annotations

from typing import Any

from .base import LessonProvider, ProgressCallback


class MockLessonProvider(LessonProvider):
    name = "mock"

    def generate(
        self,
        payload: dict[str, Any],
        *,
        model: str,
        on_progress: ProgressCallback,
    ) -> dict[str, Any]:
        segments = payload["transcript"]["segments"]
        first = segments[0]
        on_progress("GENERATE_MOCK", 70)
        return {
            "title": "Mock Lesson",
            "summaryVi": "Bài học mẫu dùng cho smoke test.",
            "topic": "testing",
            "difficulty": "A2",
            "meaning": [{"segmentId": first["id"], "vi": "Bản dịch mẫu."}],
            "keyPhrases": [{
                "phrase": first.get("cleanedText") or first.get("rawText"),
                "meaningVi": "Cụm từ mẫu.",
                "whyUseful": "Dùng để kiểm tra contract.",
                "sourceSegmentIds": [first["id"]],
            }],
            "patterns": [],
            "shadowingChunks": [{
                "segmentId": first["id"],
                "chunks": [first.get("cleanedText") or first.get("rawText")],
            }],
            "questions": [],
            "provider": self.name,
            "model": model,
        }

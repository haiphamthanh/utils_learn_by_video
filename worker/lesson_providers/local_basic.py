from __future__ import annotations

import re
from typing import Any

from .base import LessonProvider, ProgressCallback

USEFUL_PATTERNS: list[tuple[re.Pattern[str], str, str]] = [
    (re.compile(r"\bi used to\b", re.I), "I used to...", "Dùng để nói về một thói quen hoặc suy nghĩ trong quá khứ."),
    (re.compile(r"\bbut now i\b", re.I), "...but now I...", "Dùng để đối chiếu quá khứ với hiện tại."),
    (re.compile(r"\bwhat i mean is\b", re.I), "What I mean is...", "Dùng để giải thích lại ý của mình rõ hơn."),
    (re.compile(r"\bthe problem is\b", re.I), "The problem is...", "Dùng để nêu vấn đề trọng tâm."),
    (re.compile(r"\bit turns out\b", re.I), "It turns out...", "Dùng để nói về một kết quả hoặc sự thật được phát hiện sau đó."),
    (re.compile(r"\bthe way i see it\b", re.I), "The way I see it...", "Dùng để đưa ra góc nhìn cá nhân."),
]


def _effective_text(segment: dict[str, Any]) -> str:
    return str(
        segment.get("reviewedText")
        or segment.get("cleanedText")
        or segment.get("rawText")
        or ""
    ).strip()


def _chunk(text: str, language: str, max_words: int = 5, max_cjk_chars: int = 12) -> list[str]:
    parts = [
        part.strip()
        for part in re.split(r"[,;:.!?、，。！？；]+", text)
        if part.strip()
    ]
    chunks: list[str] = []
    for part in parts:
        if language in {"ja", "zh"}:
            chunks.extend(
                part[index:index + max_cjk_chars]
                for index in range(0, len(part), max_cjk_chars)
                if part[index:index + max_cjk_chars]
            )
            continue

        words = part.split()
        for index in range(0, len(words), max_words):
            value = " ".join(words[index:index + max_words]).strip()
            if value:
                chunks.append(value)
    return chunks or ([text] if text else [])


def _title(payload: dict[str, Any], segments: list[dict[str, Any]]) -> str:
    source = payload.get("source") or {}
    note = str(payload.get("personalNote") or "").strip()
    source_title = str(source.get("title") or "").strip()
    first = _effective_text(segments[0]) if segments else ""

    for candidate in (source_title, note, first):
        if candidate:
            candidate = re.sub(r"\s+", " ", candidate)
            return candidate[:72].rstrip(" .,!?")
    return "A Small Language Moment"


class LocalBasicLessonProvider(LessonProvider):
    name = "local-basic"

    def generate(
        self,
        payload: dict[str, Any],
        *,
        model: str,
        on_progress: ProgressCallback,
    ) -> dict[str, Any]:
        segments = payload.get("transcript", {}).get("segments", [])
        language = str(payload.get("transcript", {}).get("language") or "en").lower()
        on_progress("ANALYZE_TRANSCRIPT", 35)

        key_phrases: list[dict[str, Any]] = []
        patterns: list[dict[str, Any]] = []
        used_phrases: set[str] = set()

        if language == "en":
            for segment in segments:
                text = _effective_text(segment)
                for regex, phrase, explanation in USEFUL_PATTERNS:
                    if regex.search(text) and phrase not in used_phrases:
                        used_phrases.add(phrase)
                        key_phrases.append({
                            "phrase": phrase,
                            "meaningVi": explanation,
                            "whyUseful": explanation,
                            "sourceSegmentIds": [segment["id"]],
                        })
                        patterns.append({
                            "pattern": phrase,
                            "explanationVi": explanation,
                            "example": text,
                        })

        if not key_phrases:
            for segment in segments[:3]:
                text = _effective_text(segment)
                if text:
                    key_phrases.append({
                        "phrase": text[:90],
                        "meaningVi": "Cụm câu được lấy trực tiếp từ video để luyện nghe và shadowing.",
                        "whyUseful": "Ngắn, bám sát ngữ cảnh gốc và dễ luyện lặp lại.",
                        "sourceSegmentIds": [segment["id"]],
                    })

        on_progress("BUILD_SHADOWING", 60)
        shadowing = [
            {
                "segmentId": segment["id"],
                "chunks": _chunk(_effective_text(segment), language),
            }
            for segment in segments
            if _effective_text(segment)
        ]

        on_progress("BUILD_LESSON", 80)
        return {
            "title": _title(payload, segments),
            "summaryVi": (
                "Bài học được tạo ở chế độ local-basic từ transcript. "
                "Chuyển LESSON_PROVIDER=openai để có bản dịch tiếng Việt và phân tích ngôn ngữ sâu hơn."
            ),
            "topic": "personal-learning",
            "difficulty": "UNRATED",
            "meaning": [],
            "keyPhrases": key_phrases[:5],
            "patterns": patterns[:5],
            "shadowingChunks": shadowing,
            "questions": [],
            "provider": self.name,
            "model": model,
        }

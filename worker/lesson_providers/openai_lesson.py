from __future__ import annotations

import json
import os
from typing import Any

from openai import OpenAI
from pydantic import BaseModel, Field

from .base import LessonProvider, ProgressCallback


class MeaningItem(BaseModel):
    segmentId: str
    vi: str


class KeyPhrase(BaseModel):
    phrase: str
    meaningVi: str
    whyUseful: str
    sourceSegmentIds: list[str]


class Pattern(BaseModel):
    pattern: str
    explanationVi: str
    example: str


class ShadowingChunk(BaseModel):
    segmentId: str
    chunks: list[str]


class Question(BaseModel):
    question: str
    answer: str


class LessonContent(BaseModel):
    title: str = Field(max_length=90)
    summaryVi: str
    topic: str
    difficulty: str
    meaning: list[MeaningItem]
    keyPhrases: list[KeyPhrase]
    patterns: list[Pattern]
    shadowingChunks: list[ShadowingChunk]
    questions: list[Question]


class OpenAILessonProvider(LessonProvider):
    name = "openai"

    def generate(
        self,
        payload: dict[str, Any],
        *,
        model: str,
        on_progress: ProgressCallback,
    ) -> dict[str, Any]:
        if not os.environ.get("OPENAI_API_KEY"):
            raise RuntimeError("OPENAI_API_KEY is required for the OpenAI lesson provider.")

        on_progress("PREPARE_PROMPT", 25)
        client = OpenAI()

        transcript = payload.get("transcript") or {}
        source = payload.get("source") or {}
        compact_input = {
            "source": {
                "type": source.get("type"),
                "title": source.get("title"),
                "url": source.get("url"),
            },
            "personalNote": payload.get("personalNote") or "",
            "segments": transcript.get("segments") or [],
        }

        instructions = """
You create compact English-learning lessons for a Vietnamese software/system engineer.
Use only the supplied transcript as source material. Do not invent what the speaker said.
Preserve natural spoken English, including useful informal forms.
Rules:
- Return Vietnamese explanations in clear natural Vietnamese.
- Maximum 5 key phrases.
- Prefer reusable communication patterns over rare vocabulary.
- Every key phrase must cite one or more real source segment IDs.
- Every meaning item must map to a real segment ID.
- Shadowing chunks must contain only words from that segment and remain in original order.
- Maximum 3 comprehension questions.
- Examples should preferably relate to software engineering, systems, AI, learning, or work communication.
- difficulty must be one of A1, A2, B1, B2, C1, C2, or UNRATED.
""".strip()

        on_progress("GENERATE_WITH_AI", 55)
        response = client.responses.parse(
            model=model,
            input=[
                {"role": "system", "content": instructions},
                {
                    "role": "user",
                    "content": "Create the lesson from this JSON input:\n" + json.dumps(compact_input, ensure_ascii=False),
                },
            ],
            text_format=LessonContent,
        )

        lesson = response.output_parsed
        if lesson is None:
            raise RuntimeError("OpenAI returned no structured lesson output.")

        on_progress("VALIDATE_LESSON", 85)
        result = lesson.model_dump()
        result["provider"] = self.name
        result["model"] = model
        return result

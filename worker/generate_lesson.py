from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from lesson_providers.factory import create_lesson_provider


def emit(event: dict[str, Any]) -> None:
    print(json.dumps(event, ensure_ascii=False), flush=True)


def progress(stage: str, value: int) -> None:
    emit({"event": "progress", "stage": stage, "progress": value})


def validate_generated_lesson(payload: dict[str, Any], source_payload: dict[str, Any]) -> None:
    required = ["title", "summaryVi", "topic", "difficulty", "keyPhrases", "shadowingChunks"]
    for key in required:
        if key not in payload:
            raise ValueError(f"Generated lesson is missing required field: {key}")

    segment_ids = {
        segment["id"]
        for segment in source_payload.get("transcript", {}).get("segments", [])
    }

    for item in payload.get("meaning", []):
        if item.get("segmentId") not in segment_ids:
            raise ValueError("Lesson meaning references an unknown segment ID.")

    for item in payload.get("keyPhrases", []):
        refs = item.get("sourceSegmentIds") or []
        if any(ref not in segment_ids for ref in refs):
            raise ValueError("A key phrase references an unknown segment ID.")

    for item in payload.get("shadowingChunks", []):
        if item.get("segmentId") not in segment_ids:
            raise ValueError("A shadowing chunk references an unknown segment ID.")


def build_canonical_lesson(source_payload: dict[str, Any], generated: dict[str, Any]) -> dict[str, Any]:
    lesson_meta = source_payload.get("lesson") or {}
    transcript = source_payload.get("transcript") or {}

    return {
        "schemaVersion": "1.0",
        "lesson": {
            "id": lesson_meta["id"],
            "title": generated["title"],
            "topic": generated["topic"],
            "difficulty": generated["difficulty"],
            "createdAt": lesson_meta["createdAt"],
            "provider": generated["provider"],
            "model": generated["model"],
        },
        "source": source_payload.get("source") or {},
        "media": source_payload.get("media") or {},
        "transcript": transcript,
        "learning": {
            "summaryVi": generated.get("summaryVi", ""),
            "meaning": generated.get("meaning", []),
            "keyPhrases": generated.get("keyPhrases", [])[:5],
            "patterns": generated.get("patterns", [])[:5],
            "shadowingChunks": generated.get("shadowingChunks", []),
            "questions": generated.get("questions", [])[:3],
        },
        "journal": {
            "whyISavedThis": source_payload.get("personalNote") or "",
            "myThought": "",
            "favoritePhrase": "",
            "myExample": "",
        },
        "progress": {
            "status": "NEW",
            "listenCount": 0,
            "shadowCount": 0,
        },
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--provider", required=True)
    parser.add_argument("--model", required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        source_payload = json.loads(Path(args.input).read_text(encoding="utf-8"))
        provider = create_lesson_provider(args.provider)

        progress("LOAD_LESSON_PROVIDER", 10)
        generated = provider.generate(
            source_payload,
            model=args.model,
            on_progress=progress,
        )

        progress("VALIDATE_LESSON", 90)
        validate_generated_lesson(generated, source_payload)
        canonical = build_canonical_lesson(source_payload, generated)

        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(
            json.dumps(canonical, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        emit({"event": "complete", "output": str(output)})
        return 0
    except Exception as exc:  # noqa: BLE001
        emit({"event": "error", "message": str(exc)})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

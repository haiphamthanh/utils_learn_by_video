from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from providers.factory import create_provider


def emit(event: str, **payload: Any) -> None:
    print(json.dumps({"event": event, **payload}), flush=True)


def validate_result(result: dict[str, Any]) -> None:
    if not isinstance(result.get("text"), str):
        raise ValueError("Transcription result must contain text.")

    segments = result.get("segments")
    if not isinstance(segments, list) or not segments:
        raise ValueError("Transcription result must contain at least one segment.")

    previous_start = -1
    for index, segment in enumerate(segments):
        start_ms = segment.get("startMs")
        end_ms = segment.get("endMs")
        text = segment.get("text")

        if not isinstance(start_ms, int) or not isinstance(end_ms, int):
            raise ValueError(f"Segment {index} has invalid timestamps.")
        if start_ms < 0 or end_ms <= start_ms or start_ms < previous_start:
            raise ValueError(f"Segment {index} has invalid ordering.")
        if not isinstance(text, str) or not text.strip():
            raise ValueError(f"Segment {index} has no text.")

        previous_start = start_ms


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--provider", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--language", default="en")
    parser.add_argument("--device", default="cpu")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    audio_path = Path(args.input).resolve()
    output_path = Path(args.output).resolve()

    if not audio_path.is_file():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    provider = create_provider(args.provider)

    def on_progress(stage: str, progress: int) -> None:
        emit("progress", stage=stage, progress=progress)

    emit("progress", stage="STARTING", progress=5)
    result = provider.transcribe(
        audio_path,
        model=args.model,
        language=args.language or None,
        device=args.device,
        on_progress=on_progress,
    )

    emit("progress", stage="VALIDATE_TRANSCRIPT", progress=80)
    validate_result(result)

    output_path.write_text(
        json.dumps(result, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    emit("complete", stage="COMPLETE", progress=100, output=str(output_path))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        emit("error", message=str(exc), errorType=type(exc).__name__)
        print(f"Transcription worker failed: {exc}", file=sys.stderr)
        raise SystemExit(1)

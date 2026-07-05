from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class PipelineJob:
    job_id: str
    inbox_item_id: str
    media_asset_id: str
    working_directory: Path
    config: dict[str, Any]


def run_lesson_pipeline(job: PipelineJob) -> dict[str, Any]:
    """Run transcript cleaning and lesson generation.

    Reserved for Phase 5. Media preparation and transcription are already
    implemented by the Node orchestrator plus dedicated workers.
    """
    raise NotImplementedError("Lesson generation starts in Phase 5.")

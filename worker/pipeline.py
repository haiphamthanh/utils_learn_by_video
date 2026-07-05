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


def run_pipeline(job: PipelineJob) -> dict[str, Any]:
    """Run the complete media-to-lesson pipeline.

    Implemented in Phase 3 onward.
    """
    raise NotImplementedError("Pipeline stages are not implemented yet.")

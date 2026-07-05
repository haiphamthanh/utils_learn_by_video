from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Callable

ProgressCallback = Callable[[str, int], None]


class LessonProvider(ABC):
    name: str

    @abstractmethod
    def generate(
        self,
        payload: dict[str, Any],
        *,
        model: str,
        on_progress: ProgressCallback,
    ) -> dict[str, Any]:
        raise NotImplementedError

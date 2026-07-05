"""Enjoy Journal worker entry point.

Phase 1–2 deliberately keep the AI pipeline inactive.
The next implementation phase will add:

VALIDATE
  -> PREPARE_MEDIA
  -> TRANSCRIBE
  -> CLEAN_SCRIPT
  -> GENERATE_LESSON
  -> QUALITY_CHECK
"""

from __future__ import annotations


def main() -> None:
    print("Enjoy Journal worker scaffold is ready.")


if __name__ == "__main__":
    main()

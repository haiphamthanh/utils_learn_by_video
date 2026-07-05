"""Enjoy Journal worker entry point.

The active transcription worker is ``worker/transcribe.py``.
Future phases will add transcript cleaning and lesson generation workers.
"""

from __future__ import annotations


def main() -> None:
    print("Enjoy Journal worker environment is ready.")
    print("Use worker/transcribe.py for transcription jobs.")


if __name__ == "__main__":
    main()

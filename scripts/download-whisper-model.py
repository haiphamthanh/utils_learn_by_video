from __future__ import annotations

import os

import whisper

model_name = os.environ.get("TRANSCRIPTION_MODEL", "base.en")
device = os.environ.get("WHISPER_DEVICE", "cpu")

print(f"Downloading/loading Whisper model: {model_name} ({device})")
whisper.load_model(model_name, device=device)
print("Whisper model ready.")

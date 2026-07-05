#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

node --check app/routes/lessons.routes.js
node --check app/services/learning.service.js
node --check public/js/lesson-player.js

python3 - <<'PY'
import re
import sqlite3
from pathlib import Path

schema_source = Path("app/db/schema.js").read_text(encoding="utf-8")
match = re.search(r"export const schemaSql = `(?P<sql>.*)`;\s*$", schema_source, re.S)
assert match, "Could not read schemaSql"
schema = match.group("sql")

connection = sqlite3.connect(":memory:")
connection.execute("PRAGMA foreign_keys = ON")
connection.executescript(schema)

tables = {
    row[0]
    for row in connection.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    )
}
for required in {
    "lessons",
    "journal_entries",
    "learning_progress",
    "transcript_segments",
}:
    assert required in tables, f"Missing table: {required}"

connection.execute(
    "INSERT INTO sources VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ("source_1", "uploaded-file", None, "Smoke", None, None, "2026-07-05", "2026-07-05"),
)
connection.execute(
    "INSERT INTO inbox_items (id, source_id, status, personal_note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    ("inbox_1", "source_1", "LESSON_READY", "Saved note", "2026-07-05", "2026-07-05"),
)
connection.execute(
    "INSERT INTO media_assets (id, inbox_item_id, media_type, original_path, created_at) VALUES (?, ?, ?, ?, ?)",
    ("media_1", "inbox_1", "video/mp4", "/tmp/original.mp4", "2026-07-05"),
)
connection.execute(
    "INSERT INTO transcripts (id, media_asset_id, raw_text, provider, model, status, raw_json_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ("transcript_1", "media_1", "Hello world", "mock", "mock", "READY", "/tmp/raw.json", "2026-07-05", "2026-07-05"),
)
connection.execute(
    "INSERT INTO lessons (id, inbox_item_id, transcript_id, title, provider, model, status, lesson_json_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ("lesson_1", "inbox_1", "transcript_1", "Smoke lesson", "mock", "mock", "READY", "/tmp/lesson.json", "2026-07-05", "2026-07-05"),
)
connection.execute(
    "INSERT INTO journal_entries (id, lesson_id, entry_type, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    ("journal_1", "lesson_1", "MY_THOUGHT", "A useful idea", "2026-07-05", "2026-07-05"),
)
connection.execute(
    "INSERT INTO learning_progress (lesson_id, learning_status, listen_count, shadow_count) VALUES (?, ?, ?, ?)",
    ("lesson_1", "LEARNING", 2, 1),
)
connection.commit()

journal = connection.execute(
    "SELECT content FROM journal_entries WHERE lesson_id='lesson_1'"
).fetchone()[0]
progress = connection.execute(
    "SELECT learning_status, listen_count, shadow_count FROM learning_progress WHERE lesson_id='lesson_1'"
).fetchone()
assert journal == "A useful idea"
assert progress == ("LEARNING", 2, 1)

player_source = Path("public/js/lesson-player.js").read_text(encoding="utf-8")
for required in [
    "data-loop-toggle",
    "data-speed=\"0.75\"",
    "data-lesson-tab=\"meaning\"",
    "data-journal-form",
    "SHADOW_COMPLETED",
]:
    assert required in player_source, f"Missing learning player behavior: {required}"

route_source = Path("app/routes/lessons.routes.js").read_text(encoding="utf-8")
assert "Content-Range" in route_source
assert "Accept-Ranges" in route_source


legacy = sqlite3.connect(":memory:")
legacy.execute("PRAGMA foreign_keys = ON")
legacy.executescript(Path("tests/fixtures/schema-v0.4.0.sql").read_text(encoding="utf-8"))
legacy.execute(
    "INSERT INTO sources VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ("legacy_source", "uploaded-file", None, "Legacy source", None, None, "2026-07-05", "2026-07-05"),
)
legacy.execute(
    "INSERT INTO inbox_items (id, source_id, status, personal_note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    ("legacy_inbox", "legacy_source", "LESSON_READY", "Keep me", "2026-07-05", "2026-07-05"),
)
legacy.execute(
    "INSERT INTO media_assets (id, inbox_item_id, media_type, original_path, created_at) VALUES (?, ?, ?, ?, ?)",
    ("legacy_media", "legacy_inbox", "video/mp4", "/tmp/original.mp4", "2026-07-05"),
)
legacy.execute(
    "INSERT INTO transcripts (id, media_asset_id, raw_text, provider, model, status, raw_json_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ("legacy_transcript", "legacy_media", "hello", "mock", "mock", "READY", "/tmp/raw.json", "2026-07-05", "2026-07-05"),
)
legacy.execute(
    "INSERT INTO lessons (id, inbox_item_id, transcript_id, title, provider, model, status, lesson_json_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ("legacy_lesson", "legacy_inbox", "legacy_transcript", "Legacy lesson", "mock", "mock", "READY", "/tmp/lesson.json", "2026-07-05", "2026-07-05"),
)
legacy.commit()
legacy.executescript(schema)
assert legacy.execute("SELECT title FROM lessons WHERE id='legacy_lesson'").fetchone()[0] == "Legacy lesson"
legacy_tables = {
    row[0]
    for row in legacy.execute("SELECT name FROM sqlite_master WHERE type='table'")
}
assert {"journal_entries", "learning_progress"} <= legacy_tables

print("Learning player and v0.4.0 migration smoke test passed.")
PY

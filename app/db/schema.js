export const schemaSql = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  url TEXT,
  title TEXT,
  author TEXT,
  platform TEXT,
  captured_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inbox_items (
  id TEXT PRIMARY KEY,
  source_id TEXT,
  status TEXT NOT NULL,
  personal_note TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(source_id) REFERENCES sources(id)
);

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  inbox_item_id TEXT NOT NULL UNIQUE,
  original_filename TEXT,
  media_type TEXT NOT NULL,
  original_path TEXT NOT NULL,
  normalized_video_path TEXT,
  normalized_audio_path TEXT,
  poster_path TEXT,
  duration_ms INTEGER,
  size_bytes INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY(inbox_item_id) REFERENCES inbox_items(id)
);

CREATE TABLE IF NOT EXISTS source_acquisition_jobs (
  id TEXT PRIMARY KEY,
  inbox_item_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  status TEXT NOT NULL,
  stage TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(inbox_item_id) REFERENCES inbox_items(id)
);

CREATE TABLE IF NOT EXISTS processing_jobs (
  id TEXT PRIMARY KEY,
  inbox_item_id TEXT NOT NULL,
  media_asset_id TEXT NOT NULL,
  status TEXT NOT NULL,
  stage TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(inbox_item_id) REFERENCES inbox_items(id),
  FOREIGN KEY(media_asset_id) REFERENCES media_assets(id)
);

CREATE TABLE IF NOT EXISTS transcripts (
  id TEXT PRIMARY KEY,
  media_asset_id TEXT NOT NULL,
  language TEXT,
  raw_text TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL,
  raw_json_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(media_asset_id) REFERENCES media_assets(id)
);

CREATE TABLE IF NOT EXISTS transcript_segments (
  id TEXT PRIMARY KEY,
  transcript_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  raw_text TEXT NOT NULL,
  cleaned_text TEXT,
  reviewed_text TEXT,
  confidence REAL,
  review_status TEXT NOT NULL DEFAULT 'UNREVIEWED',
  FOREIGN KEY(transcript_id) REFERENCES transcripts(id)
);

CREATE TABLE IF NOT EXISTS transcription_jobs (
  id TEXT PRIMARY KEY,
  inbox_item_id TEXT NOT NULL,
  media_asset_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL,
  stage TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(inbox_item_id) REFERENCES inbox_items(id),
  FOREIGN KEY(media_asset_id) REFERENCES media_assets(id)
);

CREATE TABLE IF NOT EXISTS lessons (
  id TEXT PRIMARY KEY,
  inbox_item_id TEXT NOT NULL,
  transcript_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary_vi TEXT,
  topic TEXT,
  difficulty TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL,
  lesson_json_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(inbox_item_id) REFERENCES inbox_items(id),
  FOREIGN KEY(transcript_id) REFERENCES transcripts(id)
);

CREATE TABLE IF NOT EXISTS lesson_generation_jobs (
  id TEXT PRIMARY KEY,
  inbox_item_id TEXT NOT NULL,
  transcript_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL,
  stage TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(inbox_item_id) REFERENCES inbox_items(id),
  FOREIGN KEY(transcript_id) REFERENCES transcripts(id)
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL,
  entry_type TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(lesson_id) REFERENCES lessons(id)
);

CREATE TABLE IF NOT EXISTS learning_progress (
  lesson_id TEXT PRIMARY KEY,
  learning_status TEXT NOT NULL DEFAULT 'NEW',
  listen_count INTEGER NOT NULL DEFAULT 0,
  shadow_count INTEGER NOT NULL DEFAULT 0,
  last_opened_at TEXT,
  last_completed_at TEXT,
  FOREIGN KEY(lesson_id) REFERENCES lessons(id)
);

-- Lightweight registry for the share/import workflow.
-- One row per lesson identity (slug) so we can remember that a lesson is
-- either already imported locally or has been intentionally deleted and
-- should be ignored on future imports. The key is a deterministic slug
-- derived from the lesson title + source URL so it stays stable across
-- machines and is independent of local database IDs.
CREATE TABLE IF NOT EXISTS share_registry (
  slug TEXT PRIMARY KEY,
  title TEXT,
  source_url TEXT,
  inbox_item_id TEXT,
  lesson_id TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  imported_at TEXT NOT NULL,
  last_exported_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inbox_status
  ON inbox_items(status);

CREATE INDEX IF NOT EXISTS idx_inbox_updated_at
  ON inbox_items(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_media_inbox_item
  ON media_assets(inbox_item_id);

CREATE INDEX IF NOT EXISTS idx_source_acquisition_jobs_inbox
  ON source_acquisition_jobs(inbox_item_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_processing_jobs_inbox
  ON processing_jobs(inbox_item_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_transcripts_media
  ON transcripts(media_asset_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transcript_segments_transcript
  ON transcript_segments(transcript_id, sequence);

CREATE INDEX IF NOT EXISTS idx_transcription_jobs_inbox
  ON transcription_jobs(inbox_item_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_lessons_inbox
  ON lessons(inbox_item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lessons_transcript
  ON lessons(transcript_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lesson_jobs_inbox
  ON lesson_generation_jobs(inbox_item_id, started_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_lesson_type
  ON journal_entries(lesson_id, entry_type);

CREATE INDEX IF NOT EXISTS idx_journal_content
  ON journal_entries(content);

CREATE INDEX IF NOT EXISTS idx_learning_progress_status
  ON learning_progress(learning_status, last_opened_at);

CREATE INDEX IF NOT EXISTS idx_share_registry_deleted
  ON share_registry(deleted, updated_at DESC);
`;

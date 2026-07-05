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

CREATE INDEX IF NOT EXISTS idx_inbox_status
  ON inbox_items(status);

CREATE INDEX IF NOT EXISTS idx_inbox_updated_at
  ON inbox_items(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_media_inbox_item
  ON media_assets(inbox_item_id);

CREATE INDEX IF NOT EXISTS idx_processing_jobs_inbox
  ON processing_jobs(inbox_item_id, started_at DESC);
`;

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

import { config } from "../config.js";
import { schemaSql } from "./schema.js";

let db;

function ensureDataDirectories() {
  for (const directory of [
    config.dataDir,
    path.join(config.dataDir, "inbox"),
    path.join(config.dataDir, "lessons"),
    path.join(config.dataDir, "temp"),
    path.join(config.dataDir, "exports"),
  ]) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function initializeDatabaseConnection(databasePath) {
  const connection = new Database(databasePath);
  connection.pragma("journal_mode = WAL");
  connection.exec(schemaSql);

  const noteTagForeignKeys = connection.prepare("PRAGMA foreign_key_list(note_tags)").all();
  if (noteTagForeignKeys.some((foreignKey) => foreignKey.table === "lesson_notes")) {
    connection.exec(`
      DROP TABLE note_tags;
      CREATE TABLE note_tags (
        note_id TEXT NOT NULL,
        tag_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (note_id, tag_id),
        FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE,
        FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
      );
      CREATE INDEX idx_note_tags_tag ON note_tags(tag_id, note_id);
    `);
  }

  try {
    connection.exec(
      "ALTER TABLE share_registry ADD COLUMN last_exported_at TEXT",
    );
  } catch {
    // column already exists — safe to ignore
  }

  try {
    connection.exec(
      "ALTER TABLE learning_progress ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0",
    );
  } catch {
    // column already exists — safe to ignore
  }

  try {
    connection.exec(
      "ALTER TABLE learning_progress ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0",
    );
  } catch {
    // column already exists — safe to ignore
  }

  try {
    connection.exec(
      "ALTER TABLE lesson_notes ADD COLUMN title TEXT NOT NULL DEFAULT ''",
    );
  } catch {
    // column already exists — safe to ignore
  }

  try {
    connection.exec(
      "ALTER TABLE notes ADD COLUMN is_done INTEGER NOT NULL DEFAULT 0",
    );
  } catch {
    // column already exists — safe to ignore
  }

  try {
    connection.exec(
      "ALTER TABLE inbox_items ADD COLUMN source_language TEXT NOT NULL DEFAULT 'en'",
    );
  } catch {
    // column already exists — safe to ignore
  }

  return connection;
}

export function initializeDatabase() {
  if (db) return db;

  ensureDataDirectories();

  const databasePath = path.join(config.dataDir, "journal.db");

  try {
    db = initializeDatabaseConnection(databasePath);
    return db;
  } catch (error) {
    const isCorruptDatabase =
      error?.code === "SQLITE_CORRUPT" || error?.code === "SQLITE_NOTADB";

    if (!isCorruptDatabase || !fs.existsSync(databasePath)) {
      throw error;
    }

    const backupPath = `${databasePath}.${Date.now()}.corrupt`;
    fs.renameSync(databasePath, backupPath);

    try {
      db = initializeDatabaseConnection(databasePath);
      console.warn(
        `[db] Rebuilt corrupt database at ${databasePath} from backup ${backupPath}`,
      );
      return db;
    } catch (retryError) {
      if (fs.existsSync(backupPath) && !fs.existsSync(databasePath)) {
        fs.renameSync(backupPath, databasePath);
      }
      throw retryError;
    }
  }
}

export function getDatabase() {
  return db || initializeDatabase();
}

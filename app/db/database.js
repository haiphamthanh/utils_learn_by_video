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

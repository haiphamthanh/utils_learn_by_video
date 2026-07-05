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
    path.join(config.dataDir, "temp")
  ]) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

export function initializeDatabase() {
  if (db) return db;

  ensureDataDirectories();

  const databasePath = path.join(config.dataDir, "journal.db");
  db = new Database(databasePath);
  db.pragma("journal_mode = WAL");
  db.exec(schemaSql);

  return db;
}

export function getDatabase() {
  return db || initializeDatabase();
}

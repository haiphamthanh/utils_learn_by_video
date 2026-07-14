import path from "node:path";
import fs from "node:fs";
import { initializeDatabase, getDatabase } from "./database.js";
import { config } from "../config.js";

initializeDatabase();

const db = getDatabase();
const migratedFlag = db.prepare(
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'migration_flags'"
).get();

if (!migratedFlag) {
  db.exec("CREATE TABLE migration_flags (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
}

const alreadyApplied = db.prepare("SELECT name FROM migration_flags WHERE name = ?").get("paths-to-relative");

if (alreadyApplied) {
  console.log("Migration 'paths-to-relative' already applied.");
  process.exit(0);
}

function extractRelativePath(value) {
  if (!value) return value;

  if (!path.isAbsolute(value) && !value.startsWith("..")) {
    return value;
  }

  const dataIndex = value.indexOf("/data/");
  if (dataIndex !== -1) {
    return value.slice(dataIndex + 6);
  }

  const dataIndexWindows = value.indexOf("\\data\\");
  if (dataIndexWindows !== -1) {
    return value.slice(dataIndexWindows + 6).replace(/\\/g, "/");
  }

  return value;
}

const pathColumns = [
  { table: "media_assets", column: "original_path" },
  { table: "media_assets", column: "normalized_video_path" },
  { table: "media_assets", column: "normalized_audio_path" },
  { table: "media_assets", column: "poster_path" },
  { table: "transcripts", column: "raw_json_path" },
  { table: "lessons", column: "lesson_json_path" },
];

let convertedCount = 0;

const transaction = db.transaction(() => {
  for (const { table, column } of pathColumns) {
    const rows = db.prepare(`SELECT id, ${column} FROM ${table} WHERE ${column} IS NOT NULL`).all();

    const update = db.prepare(`UPDATE ${table} SET ${column} = ? WHERE id = ?`);

    for (const row of rows) {
      const value = row[column];
      if (!value) continue;

      const relative = extractRelativePath(value);
      if (relative === value) continue;

      update.run(relative, row.id);
      convertedCount++;
    }
  }

  db.prepare("INSERT INTO migration_flags (name, applied_at) VALUES (?, ?)")
    .run("paths-to-relative", new Date().toISOString());
});

transaction();

console.log(`Converted ${convertedCount} paths to relative.`);

const lessons = db.prepare("SELECT id, lesson_json_path FROM lessons WHERE lesson_json_path IS NOT NULL").all();
let artifactConverted = 0;

for (const lesson of lessons) {
  const lessonPath = path.isAbsolute(lesson.lesson_json_path)
    ? lesson.lesson_json_path
    : path.join(config.dataDir, lesson.lesson_json_path);

  if (!fs.existsSync(lessonPath)) continue;

  try {
    const artifact = JSON.parse(fs.readFileSync(lessonPath, "utf-8"));
    let changed = false;

    if (artifact.media) {
      for (const key of ["videoPath", "audioPath", "posterPath"]) {
        if (artifact.media[key]) {
          const extracted = extractRelativePath(artifact.media[key]);
          if (extracted !== artifact.media[key]) {
            artifact.media[key] = extracted;
            changed = true;
          }
        }
      }
    }

    if (changed) {
      fs.writeFileSync(lessonPath, JSON.stringify(artifact, null, 2), "utf-8");
      artifactConverted++;
    }
  } catch {
    // skip corrupted artifacts
  }
}

if (artifactConverted > 0) {
  console.log(`Updated ${artifactConverted} lesson artifact paths to relative.`);
}

console.log("Database initialized.");

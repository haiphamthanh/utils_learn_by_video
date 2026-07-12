import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { config } from "../config.js";
import { getDatabase } from "../db/database.js";
import {
  buildSlug,
  getRegistryEntry,
  upsertRegistryEntry,
  markLessonsAsExported,
  shareError
} from "./share.service.js";

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function cleanTranscriptText(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const capitalized = text.charAt(0).toUpperCase() + text.slice(1);
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== "object") throw shareError("SHARE_MANIFEST_MISSING", "manifest.json missing in zip.", 400);
  if (manifest.format !== "enjoy-journal-share") {
    throw shareError("SHARE_FORMAT_INVALID", `Unsupported manifest format: ${manifest.format || "<unknown>"}`, 400);
  }
  if (Number(manifest.version) !== 1) {
    throw shareError("SHARE_VERSION_INVALID", `Unsupported manifest version: ${manifest.version}`, 400);
  }
  if (!Array.isArray(manifest.lessons)) {
    throw shareError("SHARE_MANIFEST_INVALID", "manifest.lessons must be an array.", 400);
  }
}

function getZipEntry(zip, entryPath) {
  return zip.getEntry(entryPath) || zip.getEntry(entryPath.replace(/^lessons\//, "")) || null;
}

function importOneLesson(db, zip, manifestEntry, options = {}) {
  const slug = manifestEntry.slug;
  const registry = getRegistryEntry(slug);

  if (registry) {
    if (registry.deleted) {
      return { slug, status: "skipped-deleted", title: registry.title };
    }
    if (registry.inboxItemId) {
      return { slug, status: "skipped-existing", title: registry.title };
    }
  }

  if (options.dryRun) {
    return { slug, status: "would-import", title: manifestEntry.title };
  }

  const metaPath = `lessons/${slug}/meta.json`;
  const lessonPath = `lessons/${slug}/lesson.json`;
  const transcriptPath = `lessons/${slug}/transcript.json`;
  const videoEntry = `lessons/${slug}/media/video.mp4`;
  const audioEntry = `lessons/${slug}/media/audio.wav`;
  const posterEntry = `lessons/${slug}/media/poster.jpg`;

  const metaEntry = getZipEntry(zip, metaPath);
  const lessonEntry = getZipEntry(zip, lessonPath);
  if (!metaEntry || !lessonEntry) {
    return { slug, status: "missing-data", title: manifestEntry.title };
  }

  const meta = JSON.parse(metaEntry.getData().toString("utf-8"));
  const lessonArtifact = JSON.parse(lessonEntry.getData().toString("utf-8"));
  const transcriptData = getZipEntry(zip, transcriptPath)
    ? JSON.parse(getZipEntry(zip, transcriptPath).getData().toString("utf-8"))
    : null;

  const inboxId = makeId("inbox");
  const sourceId = makeId("source");
  const mediaAssetId = makeId("media");
  const lessonId = makeId("lesson");
  const transcriptId = makeId("transcript");
  const timestamp = nowIso();

  const inboxDir = path.join(config.dataDir, "inbox", inboxId);
  const processedDir = path.join(inboxDir, "processed");
  const transcriptDir = path.join(inboxDir, "transcript");
  const lessonDir = path.join(inboxDir, "lesson");
  fs.mkdirSync(processedDir, { recursive: true });
  fs.mkdirSync(transcriptDir, { recursive: true });
  fs.mkdirSync(lessonDir, { recursive: true });

  function extractEntry(zipInst, entryPath, destPath) {
    const entry = getZipEntry(zipInst, entryPath);
    if (!entry) return false;
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, entry.getData());
    return true;
  }

  const mediaPaths = {
    normalizedVideoPath: null,
    normalizedAudioPath: null,
    posterPath: null
  };
  if (extractEntry(zip, videoEntry, path.join(processedDir, "normalized.mp4"))) {
    mediaPaths.normalizedVideoPath = path.join(processedDir, "normalized.mp4");
  }
  if (extractEntry(zip, audioEntry, path.join(processedDir, "audio.wav"))) {
    mediaPaths.normalizedAudioPath = path.join(processedDir, "audio.wav");
  }
  if (extractEntry(zip, posterEntry, path.join(processedDir, "poster.jpg"))) {
    mediaPaths.posterPath = path.join(processedDir, "poster.jpg");
  }

  const transcriptPathText = path.join(transcriptDir, `raw-import-${lessonId}.json`);
  const transcriptDurationMs = Number(meta.durationMs || lessonArtifact?.media?.durationMs || 0);
  if (transcriptData) {
    fs.writeFileSync(
      transcriptPathText,
      JSON.stringify({
        language: transcriptData.language || null,
        text: transcriptData.text || "",
        provider: transcriptData.provider || meta.provider || "import",
        model: transcriptData.model || meta.model || "import",
        segments: (transcriptData.segments || []).map((segment) => ({
          startMs: segment.startMs,
          endMs: segment.endMs,
          text: segment.text,
          confidence: segment.confidence ?? null
        }))
      }, null, 2),
      "utf-8"
    );
  }

  const importedLessonArtifact = JSON.parse(JSON.stringify(lessonArtifact));
  importedLessonArtifact.lesson = importedLessonArtifact.lesson || {};
  importedLessonArtifact.lesson.id = lessonId;
  importedLessonArtifact.lesson.createdAt = timestamp;
  importedLessonArtifact.media = importedLessonArtifact.media || {};
  importedLessonArtifact.media.videoPath = mediaPaths.normalizedVideoPath;
  importedLessonArtifact.media.audioPath = mediaPaths.normalizedAudioPath;
  importedLessonArtifact.media.posterPath = mediaPaths.posterPath;
  importedLessonArtifact.media.durationMs = transcriptDurationMs;

  if (importedLessonArtifact.transcript) {
    importedLessonArtifact.transcript.id = transcriptId;
  }

  const importedLessonPath = path.join(lessonDir, `lesson-${lessonId}.json`);
  fs.writeFileSync(importedLessonPath, JSON.stringify(importedLessonArtifact, null, 2), "utf-8");

  const lessonMeta = importedLessonArtifact.lesson || {};
  const summaryVi = importedLessonArtifact.learning?.summaryVi || lessonMeta?.summaryVi || "";
  const topic = lessonMeta.topic || meta.topic || null;
  const difficulty = lessonMeta.difficulty || meta.difficulty || "UNRATED";
  const provider = lessonMeta.provider || meta.provider || "import";
  const model = lessonMeta.model || meta.model || "import";
  const title = lessonMeta.title || meta.title || manifestEntry.title || slug;

  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO sources (
        id, type, url, title, author, platform, captured_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sourceId,
      meta.sourceType || "other-url",
      meta.sourceUrl || null,
      meta.sourceTitle || meta.title || title,
      meta.sourceAuthor || null,
      meta.sourcePlatform || null,
      meta.sourceCapturedAt || timestamp,
      timestamp
    );

    db.prepare(`
      INSERT INTO inbox_items (
        id, source_id, status, personal_note, created_at, updated_at
      ) VALUES (?, ?, 'LESSON_READY', ?, ?, ?)
    `).run(
      inboxId,
      sourceId,
      meta.personalNote || "",
      meta.createdAt || timestamp,
      timestamp
    );

    db.prepare(`
      INSERT INTO media_assets (
        id, inbox_item_id, original_filename, media_type, original_path,
        normalized_video_path, normalized_audio_path, poster_path,
        duration_ms, size_bytes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      mediaAssetId,
      inboxId,
      meta.sourceTitle || title,
      mediaPaths.normalizedVideoPath ? "video/mp4" : "audio/wav",
      mediaPaths.normalizedVideoPath || mediaPaths.normalizedAudioPath || "",
      mediaPaths.normalizedVideoPath,
      mediaPaths.normalizedAudioPath,
      mediaPaths.posterPath,
      transcriptDurationMs || null,
      null,
      timestamp
    );

    if (transcriptData) {
      db.prepare(`
        INSERT INTO transcripts (
          id, media_asset_id, language, raw_text, provider, model, status,
          raw_json_path, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        transcriptId,
        mediaAssetId,
        transcriptData.language || null,
        transcriptData.text || "",
        transcriptData.provider || provider,
        transcriptData.model || model,
        (transcriptData.segments || []).some((seg) => seg.reviewedText) ? "REVIEWED" : "CLEANED",
        transcriptPathText,
        timestamp,
        timestamp
      );

      const insertSegment = db.prepare(`
        INSERT INTO transcript_segments (
          id, transcript_id, sequence, start_ms, end_ms, raw_text, cleaned_text, reviewed_text, confidence
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      (transcriptData.segments || []).forEach((segment, index) => {
        insertSegment.run(
          makeId("segment"),
          transcriptId,
          segment.sequence ?? index,
          segment.startMs,
          segment.endMs,
          segment.text,
          segment.cleanedText || cleanTranscriptText(segment.text),
          segment.reviewedText || null,
          segment.confidence ?? null
        );
      });
    }

    db.prepare(`
      INSERT INTO lessons (
        id, inbox_item_id, transcript_id, title, summary_vi, topic, difficulty,
        provider, model, status, lesson_json_path, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'READY', ?, ?, ?)
    `).run(
      lessonId,
      inboxId,
      transcriptId,
      title,
      summaryVi,
      topic,
      difficulty,
      provider,
      model,
      importedLessonPath,
      timestamp,
      timestamp
    );

    const importedJournal = importedLessonArtifact.journal || {};
    const journalByType = {
      WHY_I_SAVED: importedJournal.whyISavedThis || "",
      MY_THOUGHT: importedJournal.myThought || "",
      FAVORITE_PHRASE: importedJournal.favoritePhrase || "",
      MY_EXAMPLE: importedJournal.myExample || ""
    };
    const insertJournal = db.prepare(`
      INSERT INTO journal_entries (
        id, lesson_id, entry_type, content, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const [entryType, content] of Object.entries(journalByType)) {
      if (!content) continue;
      insertJournal.run(makeId("journal"), lessonId, entryType, content, timestamp, timestamp);
    }

    const importedProgress = importedLessonArtifact.progress || {};
    db.prepare(`
      INSERT INTO learning_progress (
        lesson_id, learning_status, listen_count, shadow_count,
        last_opened_at, last_completed_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      lessonId,
      importedProgress.status || "NEW",
      Number(importedProgress.listenCount || 0),
      Number(importedProgress.shadowCount || 0),
      importedProgress.lastOpenedAt || null,
      importedProgress.lastCompletedAt || null
    );

    upsertRegistryEntry({
      slug,
      title,
      sourceUrl: meta.sourceUrl || manifestEntry.sourceUrl || null,
      inboxItemId: inboxId,
      lessonId,
      deleted: false
    });
  });

  transaction();

  return { slug, status: "imported", title, inboxId, lessonId };
}

export async function importShareFromPath(zipPath, options = {}) {
  if (!fs.existsSync(zipPath)) {
    throw shareError("SHARE_ZIP_NOT_FOUND", "Zip file not found.", 404);
  }

  const { default: AdmZip } = await import("adm-zip");
  const zip = new AdmZip(zipPath);
  return importShareFromZip(zip, options);
}

export async function importShareFromBuffer(zipBuffer, options = {}) {
  const { default: AdmZip } = await import("adm-zip");
  const zip = new AdmZip(zipBuffer);

  if (!options.dryRun) {
    const outDir = path.join(config.dataDir, "exports");
    fs.mkdirSync(outDir, { recursive: true });
    const filename = `imported-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
    const destPath = path.join(outDir, filename);
    fs.writeFileSync(destPath, zipBuffer);
  }

  return importShareFromZip(zip, options);
}

function importShareFromZip(zip, options = {}) {
  const manifestEntry = zip.getEntry("manifest.json")
    || zip.getEntries().find((entry) => entry.entryName.endsWith("manifest.json"));

  if (!manifestEntry) {
    throw shareError("SHARE_MANIFEST_MISSING", "manifest.json not found in zip.", 400);
  }

  const manifest = JSON.parse(manifestEntry.getData().toString("utf-8"));
  validateManifest(manifest);

  const db = getDatabase();
  const results = [];
  for (const lesson of manifest.lessons) {
    try {
      const result = importOneLesson(db, zip, lesson, options);
      results.push(result);
    } catch (error) {
      console.error(`[SHARE_IMPORT] Failed to import ${lesson.slug}: ${error.message}`);
      results.push({ slug: lesson.slug, status: "error", title: lesson.title, error: error.message });
    }
  }

  if (!options.dryRun) {
    const allSlugs = manifest.lessons.map((l) => l.slug).filter(Boolean);
    if (allSlugs.length) {
      markLessonsAsExported(allSlugs);
    }
  }

  return { manifest, results };
}
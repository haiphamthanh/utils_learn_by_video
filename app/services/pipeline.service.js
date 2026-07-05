import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { config } from "../config.js";
import { getDatabase } from "../db/database.js";
import { probeMedia, prepareMedia } from "./media.service.js";

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function processingError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function getProcessTarget(inboxItemId) {
  const db = getDatabase();
  return db.prepare(`
    SELECT
      i.id AS inboxItemId,
      i.status,
      m.id AS mediaAssetId,
      m.original_path AS originalPath
    FROM inbox_items i
    LEFT JOIN media_assets m ON m.inbox_item_id = i.id
    WHERE i.id = ?
  `).get(inboxItemId);
}

function updateJob(jobId, patch) {
  const db = getDatabase();
  const current = db.prepare("SELECT * FROM processing_jobs WHERE id = ?").get(jobId);
  if (!current) return;

  db.prepare(`
    UPDATE processing_jobs
    SET status = ?, stage = ?, progress = ?, error_code = ?, error_message = ?,
        completed_at = ?, updated_at = ?
    WHERE id = ?
  `).run(
    patch.status ?? current.status,
    patch.stage ?? current.stage,
    patch.progress ?? current.progress,
    patch.errorCode ?? current.error_code,
    patch.errorMessage ?? current.error_message,
    patch.completedAt ?? current.completed_at,
    nowIso(),
    jobId
  );
}

function failJob({ jobId, inboxItemId, error }) {
  const db = getDatabase();
  const errorCode = error.code || "MEDIA_PROCESSING_FAILED";
  const userMessage = error.message || "The media could not be processed.";
  const timestamp = nowIso();

  const transaction = db.transaction(() => {
    db.prepare(`
      UPDATE processing_jobs
      SET status = 'FAILED', stage = 'FAILED', error_code = ?, error_message = ?,
          completed_at = ?, updated_at = ?
      WHERE id = ?
    `).run(errorCode, userMessage, timestamp, timestamp, jobId);

    db.prepare(`
      UPDATE inbox_items
      SET status = 'FAILED', error_code = ?, error_message = ?, updated_at = ?
      WHERE id = ?
    `).run(errorCode, userMessage, timestamp, inboxItemId);
  });

  transaction();
}

async function runMediaJob({ jobId, inboxItemId, mediaAssetId, originalPath }) {
  const db = getDatabase();

  try {
    updateJob(jobId, { stage: "VALIDATE", progress: 10 });
    const probe = await probeMedia(originalPath);

    updateJob(jobId, { stage: "PREPARE_MEDIA", progress: 35 });

    const outputDirectory = path.join(
      config.dataDir,
      "inbox",
      inboxItemId,
      "processed"
    );

    fs.rmSync(outputDirectory, { recursive: true, force: true });

    const artifacts = await prepareMedia({
      inputPath: originalPath,
      outputDirectory,
      probe
    });

    updateJob(jobId, { stage: "SAVE_ARTIFACTS", progress: 90 });

    const timestamp = nowIso();
    const transaction = db.transaction(() => {
      db.prepare(`
        UPDATE media_assets
        SET normalized_video_path = ?, normalized_audio_path = ?, poster_path = ?, duration_ms = ?
        WHERE id = ?
      `).run(
        artifacts.normalizedVideoPath,
        artifacts.normalizedAudioPath,
        artifacts.posterPath,
        probe.durationMs,
        mediaAssetId
      );

      db.prepare(`
        UPDATE processing_jobs
        SET status = 'COMPLETED', stage = 'COMPLETE', progress = 100,
            completed_at = ?, updated_at = ?
        WHERE id = ?
      `).run(timestamp, timestamp, jobId);

      db.prepare(`
        UPDATE inbox_items
        SET status = 'MEDIA_READY', error_code = NULL, error_message = NULL, updated_at = ?
        WHERE id = ?
      `).run(timestamp, inboxItemId);
    });

    transaction();
  } catch (error) {
    console.error(`[JOB ${jobId}] Media processing failed`, error);
    failJob({ jobId, inboxItemId, error });
  }
}

export function startMediaProcessing(inboxItemId) {
  const db = getDatabase();
  const target = getProcessTarget(inboxItemId);

  if (!target) {
    throw processingError("INBOX_NOT_FOUND", "Inbox item not found.", 404);
  }

  if (!target.mediaAssetId || !target.originalPath) {
    throw processingError("MEDIA_REQUIRED", "Attach a media file before processing.");
  }

  if (target.status === "PROCESSING") {
    throw processingError("ALREADY_PROCESSING", "This item is already processing.", 409);
  }

  if (!["READY_TO_PROCESS", "FAILED", "MEDIA_READY"].includes(target.status)) {
    throw processingError(
      "PROCESSING_NOT_ALLOWED",
      `Processing cannot start from status ${target.status}.`,
      409
    );
  }

  const jobId = makeId("job");
  const timestamp = nowIso();

  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO processing_jobs (
        id, inbox_item_id, media_asset_id, status, stage, progress, started_at, updated_at
      ) VALUES (?, ?, ?, 'RUNNING', 'QUEUED', 0, ?, ?)
    `).run(jobId, inboxItemId, target.mediaAssetId, timestamp, timestamp);

    db.prepare(`
      UPDATE inbox_items
      SET status = 'PROCESSING', error_code = NULL, error_message = NULL, updated_at = ?
      WHERE id = ?
    `).run(timestamp, inboxItemId);
  });

  transaction();

  setImmediate(() => {
    void runMediaJob({
      jobId,
      inboxItemId,
      mediaAssetId: target.mediaAssetId,
      originalPath: target.originalPath
    });
  });

  return getProcessingStatus(inboxItemId);
}

export function getProcessingStatus(inboxItemId) {
  const db = getDatabase();

  const inbox = db.prepare(`
    SELECT status, error_code AS errorCode, error_message AS errorMessage
    FROM inbox_items
    WHERE id = ?
  `).get(inboxItemId);

  if (!inbox) {
    throw processingError("INBOX_NOT_FOUND", "Inbox item not found.", 404);
  }

  const job = db.prepare(`
    SELECT
      id,
      status,
      stage,
      progress,
      error_code AS errorCode,
      error_message AS errorMessage,
      started_at AS startedAt,
      completed_at AS completedAt,
      updated_at AS updatedAt
    FROM processing_jobs
    WHERE inbox_item_id = ?
    ORDER BY started_at DESC
    LIMIT 1
  `).get(inboxItemId);

  return {
    inboxStatus: inbox.status,
    job: job || null,
    error: inbox.errorCode
      ? { code: inbox.errorCode, message: inbox.errorMessage }
      : null
  };
}

export function recoverInterruptedProcessingJobs() {
  const db = getDatabase();
  const timestamp = nowIso();

  const interruptedJobs = db.prepare(`
    SELECT id, inbox_item_id AS inboxItemId
    FROM processing_jobs
    WHERE status = 'RUNNING'
  `).all();

  if (interruptedJobs.length === 0) return 0;

  const transaction = db.transaction(() => {
    for (const job of interruptedJobs) {
      db.prepare(`
        UPDATE processing_jobs
        SET status = 'FAILED', stage = 'FAILED',
            error_code = 'PROCESS_INTERRUPTED',
            error_message = 'Processing was interrupted. Retry the item.',
            completed_at = ?, updated_at = ?
        WHERE id = ?
      `).run(timestamp, timestamp, job.id);

      db.prepare(`
        UPDATE inbox_items
        SET status = 'FAILED',
            error_code = 'PROCESS_INTERRUPTED',
            error_message = 'Processing was interrupted. Retry the item.',
            updated_at = ?
        WHERE id = ?
      `).run(timestamp, job.inboxItemId);
    }
  });

  transaction();
  return interruptedJobs.length;
}

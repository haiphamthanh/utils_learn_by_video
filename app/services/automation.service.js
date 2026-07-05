import crypto from "node:crypto";

import { getDatabase } from "../db/database.js";
import { attachMedia, getInboxItem } from "./inbox.service.js";
import { startMediaProcessing } from "./pipeline.service.js";
import { startTranscription } from "./transcription.service.js";
import { startLessonGeneration } from "./lesson.service.js";
import { acquireSourceMedia } from "./source-acquisition.service.js";

const activeAutomaticPipelines = new Set();

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function automationError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function readStatus(inboxItemId) {
  return getDatabase().prepare(`
    SELECT status, error_code AS errorCode, error_message AS errorMessage
    FROM inbox_items
    WHERE id = ?
  `).get(inboxItemId);
}

function updateAcquisitionJob(jobId, patch) {
  const db = getDatabase();
  const current = db.prepare("SELECT * FROM source_acquisition_jobs WHERE id = ?").get(jobId);
  if (!current) return;

  db.prepare(`
    UPDATE source_acquisition_jobs
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

function failAcquisition({ jobId, inboxItemId, error }) {
  const db = getDatabase();
  const timestamp = nowIso();
  const errorCode = error.code || "SOURCE_ACQUISITION_FAILED";
  const errorMessage = error.message || "The source media could not be imported automatically.";

  const transaction = db.transaction(() => {
    db.prepare(`
      UPDATE source_acquisition_jobs
      SET status = 'FAILED', stage = 'FAILED', error_code = ?, error_message = ?,
          completed_at = ?, updated_at = ?
      WHERE id = ?
    `).run(errorCode, errorMessage, timestamp, timestamp, jobId);

    db.prepare(`
      UPDATE inbox_items
      SET status = 'MEDIA_ACQUISITION_FAILED', error_code = ?, error_message = ?, updated_at = ?
      WHERE id = ?
    `).run(errorCode, errorMessage, timestamp, inboxItemId);
  });

  transaction();
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForInboxStatus({
  inboxItemId,
  successStatuses,
  failureStatuses,
  timeoutMs = 60 * 60 * 1000
}) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const state = readStatus(inboxItemId);
    if (!state) throw automationError("INBOX_NOT_FOUND", "Inbox item not found.", 404);
    if (successStatuses.has(state.status)) return state;

    if (failureStatuses.has(state.status)) {
      throw automationError(
        state.errorCode || "AUTOMATIC_PIPELINE_FAILED",
        state.errorMessage || `Automatic analysis failed at ${state.status}.`
      );
    }

    await sleep(750);
  }

  throw automationError(
    "AUTOMATIC_PIPELINE_TIMEOUT",
    "Automatic analysis took too long and was stopped. Retry the item."
  );
}

async function acquireAndAttachMedia({ inboxItemId, sourceUrl, jobId }) {
  try {
    updateAcquisitionJob(jobId, { stage: "FETCH_SOURCE", progress: 5 });
    const file = await acquireSourceMedia({
      inboxItemId,
      sourceUrl,
      onProgress(progress, stage) {
        updateAcquisitionJob(jobId, { progress, stage });
      }
    });

    updateAcquisitionJob(jobId, { stage: "REGISTER_MEDIA", progress: 96 });
    attachMedia(inboxItemId, file);

    const timestamp = nowIso();
    updateAcquisitionJob(jobId, {
      status: "COMPLETED",
      stage: "COMPLETE",
      progress: 100,
      completedAt: timestamp
    });
  } catch (error) {
    failAcquisition({ jobId, inboxItemId, error });
    throw error;
  }
}

async function runAutomaticPipeline(inboxItemId) {
  try {
    let item = getInboxItem(inboxItemId);

    if (["WAITING_MEDIA", "MEDIA_ACQUISITION_FAILED"].includes(item.status)) {
      const sourceUrl = item.sourceUrl;
      if (!sourceUrl) {
        throw automationError(
          "SOURCE_URL_REQUIRED",
          "A source URL is required for automatic analysis."
        );
      }

      const jobId = makeId("source_job");
      const timestamp = nowIso();
      const db = getDatabase();

      const transaction = db.transaction(() => {
        db.prepare(`
          INSERT INTO source_acquisition_jobs (
            id, inbox_item_id, source_url, status, stage, progress, started_at, updated_at
          ) VALUES (?, ?, ?, 'RUNNING', 'QUEUED', 0, ?, ?)
        `).run(jobId, inboxItemId, sourceUrl, timestamp, timestamp);

        db.prepare(`
          UPDATE inbox_items
          SET status = 'ACQUIRING_MEDIA', error_code = NULL, error_message = NULL, updated_at = ?
          WHERE id = ?
        `).run(timestamp, inboxItemId);
      });

      transaction();
      await acquireAndAttachMedia({ inboxItemId, sourceUrl, jobId });
      item = getInboxItem(inboxItemId);
    }

    if (["READY_TO_PROCESS", "FAILED"].includes(item.status)) {
      startMediaProcessing(inboxItemId);
      await waitForInboxStatus({
        inboxItemId,
        successStatuses: new Set(["MEDIA_READY"]),
        failureStatuses: new Set(["FAILED"])
      });
      item = getInboxItem(inboxItemId);
    }

    if (["MEDIA_READY", "TRANSCRIPTION_FAILED"].includes(item.status)) {
      startTranscription(inboxItemId);
      await waitForInboxStatus({
        inboxItemId,
        successStatuses: new Set(["TRANSCRIPT_READY"]),
        failureStatuses: new Set(["TRANSCRIPTION_FAILED"])
      });
      item = getInboxItem(inboxItemId);
    }

    if (["TRANSCRIPT_READY", "LESSON_FAILED"].includes(item.status)) {
      startLessonGeneration(inboxItemId);
      await waitForInboxStatus({
        inboxItemId,
        successStatuses: new Set(["LESSON_READY"]),
        failureStatuses: new Set(["LESSON_FAILED"])
      });
    }
  } catch (error) {
    console.error(`[AUTO ${inboxItemId}] Automatic analysis stopped`, error);
  } finally {
    activeAutomaticPipelines.delete(inboxItemId);
  }
}

export function startAutomaticPipeline(inboxItemId) {
  const item = getInboxItem(inboxItemId);

  if (item.status === "LESSON_READY") {
    return { started: false, reason: "ALREADY_READY", item };
  }

  if (activeAutomaticPipelines.has(inboxItemId)) {
    return { started: false, reason: "ALREADY_RUNNING", item };
  }

  if (["ACQUIRING_MEDIA", "PROCESSING", "TRANSCRIBING", "LESSON_GENERATING"].includes(item.status)) {
    return { started: false, reason: "STEP_ALREADY_RUNNING", item };
  }

  activeAutomaticPipelines.add(inboxItemId);
  setImmediate(() => {
    void runAutomaticPipeline(inboxItemId);
  });

  return { started: true, reason: null, item };
}

export function recoverInterruptedAcquisitionJobs() {
  const db = getDatabase();
  const timestamp = nowIso();
  const jobs = db.prepare(`
    SELECT id, inbox_item_id AS inboxItemId
    FROM source_acquisition_jobs
    WHERE status = 'RUNNING'
  `).all();

  if (jobs.length === 0) return 0;

  const transaction = db.transaction(() => {
    for (const job of jobs) {
      db.prepare(`
        UPDATE source_acquisition_jobs
        SET status = 'FAILED', stage = 'FAILED',
            error_code = 'SOURCE_ACQUISITION_INTERRUPTED',
            error_message = 'Automatic source import was interrupted. Retry automatic analysis.',
            completed_at = ?, updated_at = ?
        WHERE id = ?
      `).run(timestamp, timestamp, job.id);

      db.prepare(`
        UPDATE inbox_items
        SET status = 'MEDIA_ACQUISITION_FAILED',
            error_code = 'SOURCE_ACQUISITION_INTERRUPTED',
            error_message = 'Automatic source import was interrupted. Retry automatic analysis.',
            updated_at = ?
        WHERE id = ?
      `).run(timestamp, job.inboxItemId);
    }
  });

  transaction();
  return jobs.length;
}

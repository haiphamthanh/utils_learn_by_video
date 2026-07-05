import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { spawn } from "node:child_process";

import { config } from "../config.js";
import { getDatabase } from "../db/database.js";

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

function transcriptionError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function getTarget(inboxItemId) {
  const db = getDatabase();
  return db.prepare(`
    SELECT
      i.id AS inboxItemId,
      i.status,
      m.id AS mediaAssetId,
      m.normalized_audio_path AS audioPath
    FROM inbox_items i
    LEFT JOIN media_assets m ON m.inbox_item_id = i.id
    WHERE i.id = ?
  `).get(inboxItemId);
}

function getProviderConfig() {
  const provider = config.transcriptionProvider;
  const model = provider === "openai"
    ? config.openaiTranscriptionModel
    : config.transcriptionModel;

  return { provider, model };
}

function updateJob(jobId, patch) {
  const db = getDatabase();
  const current = db.prepare("SELECT * FROM transcription_jobs WHERE id = ?").get(jobId);
  if (!current) return;

  db.prepare(`
    UPDATE transcription_jobs
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
  const errorCode = error.code || "TRANSCRIPTION_FAILED";
  const userMessage = error.message || "The audio could not be transcribed.";
  const timestamp = nowIso();

  const transaction = db.transaction(() => {
    db.prepare(`
      UPDATE transcription_jobs
      SET status = 'FAILED', stage = 'FAILED', error_code = ?, error_message = ?,
          completed_at = ?, updated_at = ?
      WHERE id = ?
    `).run(errorCode, userMessage, timestamp, timestamp, jobId);

    db.prepare(`
      UPDATE inbox_items
      SET status = 'TRANSCRIPTION_FAILED', error_code = ?, error_message = ?, updated_at = ?
      WHERE id = ?
    `).run(errorCode, userMessage, timestamp, inboxItemId);
  });

  transaction();
}

function normalizeWorkerError(stderr, workerMessage) {
  const detail = workerMessage || stderr.trim();

  if (detail.includes("OPENAI_API_KEY")) {
    return transcriptionError(
      "OPENAI_API_KEY_REQUIRED",
      "OPENAI_API_KEY is required for the OpenAI transcription provider."
    );
  }

  if (detail.includes("Local Whisper is not installed")) {
    return transcriptionError(
      "WHISPER_NOT_INSTALLED",
      "Local Whisper is not installed. Run ./scripts/setup-python.sh."
    );
  }

  return transcriptionError(
    "TRANSCRIPTION_WORKER_FAILED",
    detail || "The transcription worker failed."
  );
}

function persistTranscript({ inboxItemId, mediaAssetId, outputPath, jobId }) {
  const db = getDatabase();
  const payload = JSON.parse(fs.readFileSync(outputPath, "utf-8"));

  if (!Array.isArray(payload.segments) || payload.segments.length === 0) {
    throw transcriptionError(
      "TRANSCRIPT_EMPTY",
      "The transcription completed but no timed segments were produced."
    );
  }

  const transcriptId = makeId("transcript");
  const timestamp = nowIso();

  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO transcripts (
        id, media_asset_id, language, raw_text, provider, model, status,
        raw_json_path, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'CLEANED', ?, ?, ?)
    `).run(
      transcriptId,
      mediaAssetId,
      payload.language || null,
      payload.text || "",
      payload.provider,
      payload.model,
      outputPath,
      timestamp,
      timestamp
    );

    const insertSegment = db.prepare(`
      INSERT INTO transcript_segments (
        id, transcript_id, sequence, start_ms, end_ms, raw_text, cleaned_text, confidence
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    payload.segments.forEach((segment, index) => {
      insertSegment.run(
        makeId("segment"),
        transcriptId,
        index,
        segment.startMs,
        segment.endMs,
        segment.text,
        cleanTranscriptText(segment.text),
        segment.confidence ?? null
      );
    });

    db.prepare(`
      UPDATE transcription_jobs
      SET status = 'COMPLETED', stage = 'COMPLETE', progress = 100,
          completed_at = ?, updated_at = ?
      WHERE id = ?
    `).run(timestamp, timestamp, jobId);

    db.prepare(`
      UPDATE inbox_items
      SET status = 'TRANSCRIPT_READY', error_code = NULL, error_message = NULL, updated_at = ?
      WHERE id = ?
    `).run(timestamp, inboxItemId);
  });

  transaction();
  return transcriptId;
}

async function runTranscriptionJob({
  jobId,
  inboxItemId,
  mediaAssetId,
  audioPath,
  provider,
  model
}) {
  const transcriptDirectory = path.join(
    config.dataDir,
    "inbox",
    inboxItemId,
    "transcript"
  );
  fs.mkdirSync(transcriptDirectory, { recursive: true });
  const outputPath = path.join(transcriptDirectory, `raw-${jobId}.json`);

  const args = [
    path.join(config.projectRoot, "worker", "transcribe.py"),
    "--input", audioPath,
    "--output", outputPath,
    "--provider", provider,
    "--model", model,
    "--language", config.transcriptionLanguage,
    "--device", config.whisperDevice
  ];

  updateJob(jobId, { stage: "STARTING", progress: 5 });

  const child = spawn(config.pythonBin, args, {
    cwd: config.projectRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stderr = "";
  let workerErrorMessage = "";
  let jobFailed = false;

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
    process.stderr.write(chunk);
  });

  const lines = readline.createInterface({ input: child.stdout });
  lines.on("line", (line) => {
    try {
      const event = JSON.parse(line);
      if (event.event === "progress") {
        updateJob(jobId, {
          stage: event.stage,
          progress: Number(event.progress || 0)
        });
      } else if (event.event === "error") {
        workerErrorMessage = event.message || "";
      }
    } catch {
      console.log(`[TRANSCRIPTION ${jobId}] ${line}`);
    }
  });

  child.on("error", (error) => {
    jobFailed = true;
    failJob({
      jobId,
      inboxItemId,
      error: transcriptionError(
        "TRANSCRIPTION_WORKER_START_FAILED",
        `Could not start the transcription worker: ${error.message}`
      )
    });
  });

  child.on("close", (code) => {
    if (jobFailed) return;

    if (code !== 0) {
      failJob({
        jobId,
        inboxItemId,
        error: normalizeWorkerError(stderr, workerErrorMessage)
      });
      return;
    }

    try {
      updateJob(jobId, { stage: "SAVE_TRANSCRIPT", progress: 90 });
      persistTranscript({ inboxItemId, mediaAssetId, outputPath, jobId });
    } catch (error) {
      console.error(`[TRANSCRIPTION ${jobId}] Persist failed`, error);
      failJob({ jobId, inboxItemId, error });
    }
  });
}

export function startTranscription(inboxItemId) {
  const db = getDatabase();
  const target = getTarget(inboxItemId);

  if (!target) {
    throw transcriptionError("INBOX_NOT_FOUND", "Inbox item not found.", 404);
  }

  if (!target.mediaAssetId || !target.audioPath) {
    throw transcriptionError(
      "AUDIO_NOT_READY",
      "Process the media before starting transcription."
    );
  }

  if (target.status === "TRANSCRIBING") {
    throw transcriptionError(
      "ALREADY_TRANSCRIBING",
      "This item is already being transcribed.",
      409
    );
  }

  if (![
    "MEDIA_READY",
    "TRANSCRIPTION_FAILED",
    "TRANSCRIPT_READY",
    "LESSON_READY",
    "LESSON_FAILED"
  ].includes(target.status)) {
    throw transcriptionError(
      "TRANSCRIPTION_NOT_ALLOWED",
      `Transcription cannot start from status ${target.status}.`,
      409
    );
  }

  const { provider, model } = getProviderConfig();
  const jobId = makeId("transcription_job");
  const timestamp = nowIso();

  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO transcription_jobs (
        id, inbox_item_id, media_asset_id, provider, model,
        status, stage, progress, started_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'RUNNING', 'QUEUED', 0, ?, ?)
    `).run(
      jobId,
      inboxItemId,
      target.mediaAssetId,
      provider,
      model,
      timestamp,
      timestamp
    );

    db.prepare(`
      UPDATE inbox_items
      SET status = 'TRANSCRIBING', error_code = NULL, error_message = NULL, updated_at = ?
      WHERE id = ?
    `).run(timestamp, inboxItemId);
  });

  transaction();

  setImmediate(() => {
    void runTranscriptionJob({
      jobId,
      inboxItemId,
      mediaAssetId: target.mediaAssetId,
      audioPath: target.audioPath,
      provider,
      model
    });
  });

  return getTranscriptionStatus(inboxItemId);
}

export function getTranscriptionStatus(inboxItemId) {
  const db = getDatabase();

  const inbox = db.prepare(`
    SELECT status, error_code AS errorCode, error_message AS errorMessage
    FROM inbox_items
    WHERE id = ?
  `).get(inboxItemId);

  if (!inbox) {
    throw transcriptionError("INBOX_NOT_FOUND", "Inbox item not found.", 404);
  }

  const job = db.prepare(`
    SELECT
      id, provider, model, status, stage, progress,
      error_code AS errorCode,
      error_message AS errorMessage,
      started_at AS startedAt,
      completed_at AS completedAt,
      updated_at AS updatedAt
    FROM transcription_jobs
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

export function getTranscript(inboxItemId) {
  const db = getDatabase();

  const transcript = db.prepare(`
    SELECT
      t.id,
      t.language,
      t.raw_text AS rawText,
      t.provider,
      t.model,
      t.status,
      t.created_at AS createdAt
    FROM transcripts t
    JOIN media_assets m ON m.id = t.media_asset_id
    WHERE m.inbox_item_id = ?
    ORDER BY t.created_at DESC
    LIMIT 1
  `).get(inboxItemId);

  if (!transcript) {
    throw transcriptionError("TRANSCRIPT_NOT_FOUND", "Transcript not found.", 404);
  }

  const segments = db.prepare(`
    SELECT
      id,
      sequence,
      start_ms AS startMs,
      end_ms AS endMs,
      raw_text AS rawText,
      cleaned_text AS cleanedText,
      reviewed_text AS reviewedText,
      confidence,
      review_status AS reviewStatus
    FROM transcript_segments
    WHERE transcript_id = ?
    ORDER BY sequence
  `).all(transcript.id);

  const updateCleaned = db.prepare(`
    UPDATE transcript_segments
    SET cleaned_text = ?
    WHERE id = ? AND cleaned_text IS NULL
  `);
  let cleanedLegacySegments = false;

  for (const segment of segments) {
    if (!segment.cleanedText) {
      segment.cleanedText = cleanTranscriptText(segment.rawText);
      updateCleaned.run(segment.cleanedText, segment.id);
      cleanedLegacySegments = true;
    }
  }

  if (cleanedLegacySegments && transcript.status === "RAW") {
    const timestamp = nowIso();
    db.prepare(`
      UPDATE transcripts
      SET status = 'CLEANED', updated_at = ?
      WHERE id = ?
    `).run(timestamp, transcript.id);
    transcript.status = "CLEANED";
  }

  return { ...transcript, segments };
}


export function updateTranscriptSegment(inboxItemId, segmentId, payload = {}) {
  const db = getDatabase();
  const reviewedText = String(payload.reviewedText ?? "").replace(/\s+/g, " ").trim();

  if (!reviewedText) {
    throw transcriptionError(
      "REVIEWED_TEXT_REQUIRED",
      "Reviewed text cannot be empty."
    );
  }

  const segment = db.prepare(`
    SELECT ts.id, ts.transcript_id AS transcriptId
    FROM transcript_segments ts
    JOIN transcripts t ON t.id = ts.transcript_id
    JOIN media_assets m ON m.id = t.media_asset_id
    WHERE ts.id = ? AND m.inbox_item_id = ?
  `).get(segmentId, inboxItemId);

  if (!segment) {
    throw transcriptionError(
      "TRANSCRIPT_SEGMENT_NOT_FOUND",
      "Transcript segment not found.",
      404
    );
  }

  const timestamp = nowIso();
  const transaction = db.transaction(() => {
    db.prepare(`
      UPDATE transcript_segments
      SET reviewed_text = ?, review_status = 'REVIEWED'
      WHERE id = ?
    `).run(reviewedText, segmentId);

    db.prepare(`
      UPDATE transcripts
      SET status = 'REVIEWED', updated_at = ?
      WHERE id = ?
    `).run(timestamp, segment.transcriptId);

    db.prepare(`
      UPDATE inbox_items
      SET updated_at = ?
      WHERE id = ?
    `).run(timestamp, inboxItemId);
  });

  transaction();
  return getTranscript(inboxItemId);
}

export function recoverInterruptedTranscriptionJobs() {
  const db = getDatabase();
  const timestamp = nowIso();
  const jobs = db.prepare(`
    SELECT id, inbox_item_id AS inboxItemId
    FROM transcription_jobs
    WHERE status = 'RUNNING'
  `).all();

  if (jobs.length === 0) return 0;

  const transaction = db.transaction(() => {
    for (const job of jobs) {
      db.prepare(`
        UPDATE transcription_jobs
        SET status = 'FAILED', stage = 'FAILED',
            error_code = 'TRANSCRIPTION_INTERRUPTED',
            error_message = 'Transcription was interrupted. Retry the item.',
            completed_at = ?, updated_at = ?
        WHERE id = ?
      `).run(timestamp, timestamp, job.id);

      db.prepare(`
        UPDATE inbox_items
        SET status = 'TRANSCRIPTION_FAILED',
            error_code = 'TRANSCRIPTION_INTERRUPTED',
            error_message = 'Transcription was interrupted. Retry the item.',
            updated_at = ?
        WHERE id = ?
      `).run(timestamp, job.inboxItemId);
    }
  });

  transaction();
  return jobs.length;
}

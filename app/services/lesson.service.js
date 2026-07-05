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

function ensureCleanedSegments(target) {
  if (!target?.transcriptId || !Array.isArray(target.segments)) return target;

  const db = getDatabase();
  const update = db.prepare(`
    UPDATE transcript_segments
    SET cleaned_text = ?
    WHERE id = ? AND cleaned_text IS NULL
  `);

  let changed = false;
  for (const segment of target.segments) {
    if (!segment.cleanedText) {
      segment.cleanedText = cleanTranscriptText(segment.rawText);
      update.run(segment.cleanedText, segment.id);
      changed = true;
    }
  }

  if (changed) {
    db.prepare(`
      UPDATE transcripts
      SET status = CASE WHEN status = 'RAW' THEN 'CLEANED' ELSE status END, updated_at = ?
      WHERE id = ?
    `).run(nowIso(), target.transcriptId);
  }

  return target;
}

function lessonError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function providerConfig() {
  const provider = config.lessonProvider;
  const model = provider === "openai"
    ? config.openaiLessonModel
    : config.lessonModel;
  return { provider, model };
}

function getLatestTranscriptTarget(inboxItemId) {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT
      i.id AS inboxItemId,
      i.status,
      i.personal_note AS personalNote,
      s.type AS sourceType,
      s.url AS sourceUrl,
      s.title AS sourceTitle,
      s.author AS sourceAuthor,
      s.platform AS sourcePlatform,
      s.captured_at AS sourceCapturedAt,
      m.id AS mediaAssetId,
      m.normalized_video_path AS videoPath,
      m.normalized_audio_path AS audioPath,
      m.poster_path AS posterPath,
      m.duration_ms AS durationMs,
      t.id AS transcriptId,
      t.language,
      t.provider AS transcriptionProvider,
      t.model AS transcriptionModel,
      t.status AS transcriptStatus
    FROM inbox_items i
    LEFT JOIN sources s ON s.id = i.source_id
    LEFT JOIN media_assets m ON m.inbox_item_id = i.id
    LEFT JOIN transcripts t ON t.id = (
      SELECT id
      FROM transcripts
      WHERE media_asset_id = m.id
      ORDER BY created_at DESC
      LIMIT 1
    )
    WHERE i.id = ?
  `).get(inboxItemId);

  if (!row) return null;
  if (!row.transcriptId) return row;

  row.segments = db.prepare(`
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
  `).all(row.transcriptId);

  return row;
}

function updateJob(jobId, patch) {
  const db = getDatabase();
  const current = db.prepare("SELECT * FROM lesson_generation_jobs WHERE id = ?").get(jobId);
  if (!current) return;

  db.prepare(`
    UPDATE lesson_generation_jobs
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
  const timestamp = nowIso();
  const code = error.code || "LESSON_GENERATION_FAILED";
  const message = error.message || "The lesson could not be generated.";

  const transaction = db.transaction(() => {
    db.prepare(`
      UPDATE lesson_generation_jobs
      SET status = 'FAILED', stage = 'FAILED', error_code = ?, error_message = ?,
          completed_at = ?, updated_at = ?
      WHERE id = ?
    `).run(code, message, timestamp, timestamp, jobId);

    db.prepare(`
      UPDATE inbox_items
      SET status = 'LESSON_FAILED', error_code = ?, error_message = ?, updated_at = ?
      WHERE id = ?
    `).run(code, message, timestamp, inboxItemId);
  });

  transaction();
}

function normalizeWorkerError(stderr, workerMessage) {
  const detail = workerMessage || stderr.trim();

  if (detail.includes("OPENAI_API_KEY")) {
    return lessonError(
      "OPENAI_API_KEY_REQUIRED",
      "OPENAI_API_KEY is required for the OpenAI lesson provider."
    );
  }

  return lessonError(
    "LESSON_WORKER_FAILED",
    detail || "The lesson generation worker failed."
  );
}

function createInputArtifact({ target, lessonId, jobId, createdAt }) {
  const directory = path.join(config.dataDir, "inbox", target.inboxItemId, "lesson");
  fs.mkdirSync(directory, { recursive: true });
  const inputPath = path.join(directory, `input-${jobId}.json`);

  const payload = {
    lesson: {
      id: lessonId,
      createdAt
    },
    source: {
      type: target.sourceType,
      platform: target.sourcePlatform,
      url: target.sourceUrl,
      title: target.sourceTitle,
      author: target.sourceAuthor,
      capturedAt: target.sourceCapturedAt
    },
    personalNote: target.personalNote || "",
    media: {
      videoPath: target.videoPath,
      audioPath: target.audioPath,
      posterPath: target.posterPath,
      durationMs: target.durationMs
    },
    transcript: {
      id: target.transcriptId,
      language: target.language,
      provider: target.transcriptionProvider,
      model: target.transcriptionModel,
      segments: target.segments
    }
  };

  fs.writeFileSync(inputPath, JSON.stringify(payload, null, 2), "utf-8");
  return { directory, inputPath };
}

function persistLesson({ inboxItemId, transcriptId, lessonId, outputPath, jobId }) {
  const db = getDatabase();
  const payload = JSON.parse(fs.readFileSync(outputPath, "utf-8"));
  const lesson = payload.lesson || {};
  const learning = payload.learning || {};

  if (!lesson.title || !lesson.provider || !lesson.model) {
    throw lessonError(
      "LESSON_INVALID",
      "The generated lesson is missing required metadata."
    );
  }

  const timestamp = nowIso();
  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO lessons (
        id, inbox_item_id, transcript_id, title, summary_vi, topic, difficulty,
        provider, model, status, lesson_json_path, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'READY', ?, ?, ?)
    `).run(
      lessonId,
      inboxItemId,
      transcriptId,
      lesson.title,
      learning.summaryVi || "",
      lesson.topic || null,
      lesson.difficulty || "UNRATED",
      lesson.provider,
      lesson.model,
      outputPath,
      timestamp,
      timestamp
    );

    db.prepare(`
      UPDATE lesson_generation_jobs
      SET status = 'COMPLETED', stage = 'COMPLETE', progress = 100,
          completed_at = ?, updated_at = ?
      WHERE id = ?
    `).run(timestamp, timestamp, jobId);

    db.prepare(`
      UPDATE inbox_items
      SET status = 'LESSON_READY', error_code = NULL, error_message = NULL, updated_at = ?
      WHERE id = ?
    `).run(timestamp, inboxItemId);
  });

  transaction();
}

async function runLessonJob({
  jobId,
  inboxItemId,
  transcriptId,
  lessonId,
  provider,
  model,
  inputPath,
  outputPath
}) {
  const args = [
    path.join(config.projectRoot, "worker", "generate_lesson.py"),
    "--input", inputPath,
    "--output", outputPath,
    "--provider", provider,
    "--model", model
  ];

  updateJob(jobId, { stage: "STARTING", progress: 5 });

  const child = spawn(config.pythonBin, args, {
    cwd: config.projectRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stderr = "";
  let workerErrorMessage = "";
  let startFailed = false;

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
      console.log(`[LESSON ${jobId}] ${line}`);
    }
  });

  child.on("error", (error) => {
    startFailed = true;
    failJob({
      jobId,
      inboxItemId,
      error: lessonError(
        "LESSON_WORKER_START_FAILED",
        `Could not start the lesson worker: ${error.message}`
      )
    });
  });

  child.on("close", (code) => {
    if (startFailed) return;

    if (code !== 0) {
      failJob({
        jobId,
        inboxItemId,
        error: normalizeWorkerError(stderr, workerErrorMessage)
      });
      return;
    }

    try {
      updateJob(jobId, { stage: "SAVE_LESSON", progress: 95 });
      persistLesson({ inboxItemId, transcriptId, lessonId, outputPath, jobId });
    } catch (error) {
      console.error(`[LESSON ${jobId}] Persist failed`, error);
      failJob({ jobId, inboxItemId, error });
    }
  });
}

export function startLessonGeneration(inboxItemId) {
  const db = getDatabase();
  const target = ensureCleanedSegments(getLatestTranscriptTarget(inboxItemId));

  if (!target) {
    throw lessonError("INBOX_NOT_FOUND", "Inbox item not found.", 404);
  }

  if (!target.transcriptId || !target.segments?.length) {
    throw lessonError(
      "TRANSCRIPT_NOT_READY",
      "Create a transcript before generating a lesson."
    );
  }

  if (target.status === "LESSON_GENERATING") {
    throw lessonError(
      "ALREADY_GENERATING_LESSON",
      "This item is already generating a lesson.",
      409
    );
  }

  if (!["TRANSCRIPT_READY", "LESSON_FAILED", "LESSON_READY"].includes(target.status)) {
    throw lessonError(
      "LESSON_GENERATION_NOT_ALLOWED",
      `Lesson generation cannot start from status ${target.status}.`,
      409
    );
  }

  const { provider, model } = providerConfig();
  const jobId = makeId("lesson_job");
  const lessonId = makeId("lesson");
  const timestamp = nowIso();
  const { directory, inputPath } = createInputArtifact({
    target,
    lessonId,
    jobId,
    createdAt: timestamp
  });
  const outputPath = path.join(directory, `lesson-${lessonId}.json`);

  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO lesson_generation_jobs (
        id, inbox_item_id, transcript_id, provider, model,
        status, stage, progress, started_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'RUNNING', 'QUEUED', 0, ?, ?)
    `).run(
      jobId,
      inboxItemId,
      target.transcriptId,
      provider,
      model,
      timestamp,
      timestamp
    );

    db.prepare(`
      UPDATE inbox_items
      SET status = 'LESSON_GENERATING', error_code = NULL, error_message = NULL, updated_at = ?
      WHERE id = ?
    `).run(timestamp, inboxItemId);
  });

  transaction();

  setImmediate(() => {
    void runLessonJob({
      jobId,
      inboxItemId,
      transcriptId: target.transcriptId,
      lessonId,
      provider,
      model,
      inputPath,
      outputPath
    });
  });

  return getLessonGenerationStatus(inboxItemId);
}

export function getLessonGenerationStatus(inboxItemId) {
  const db = getDatabase();
  const inbox = db.prepare(`
    SELECT status, error_code AS errorCode, error_message AS errorMessage
    FROM inbox_items
    WHERE id = ?
  `).get(inboxItemId);

  if (!inbox) {
    throw lessonError("INBOX_NOT_FOUND", "Inbox item not found.", 404);
  }

  const job = db.prepare(`
    SELECT
      id, provider, model, status, stage, progress,
      error_code AS errorCode,
      error_message AS errorMessage,
      started_at AS startedAt,
      completed_at AS completedAt,
      updated_at AS updatedAt
    FROM lesson_generation_jobs
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

export function getLesson(inboxItemId) {
  const db = getDatabase();
  const lesson = db.prepare(`
    SELECT
      id,
      title,
      summary_vi AS summaryVi,
      topic,
      difficulty,
      provider,
      model,
      status,
      lesson_json_path AS lessonJsonPath,
      created_at AS createdAt
    FROM lessons
    WHERE inbox_item_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(inboxItemId);

  if (!lesson) {
    throw lessonError("LESSON_NOT_FOUND", "Lesson not found.", 404);
  }

  const payload = JSON.parse(fs.readFileSync(lesson.lessonJsonPath, "utf-8"));
  return payload;
}

export function recoverInterruptedLessonJobs() {
  const db = getDatabase();
  const timestamp = nowIso();
  const jobs = db.prepare(`
    SELECT id, inbox_item_id AS inboxItemId
    FROM lesson_generation_jobs
    WHERE status = 'RUNNING'
  `).all();

  if (jobs.length === 0) return 0;

  const transaction = db.transaction(() => {
    for (const job of jobs) {
      db.prepare(`
        UPDATE lesson_generation_jobs
        SET status = 'FAILED', stage = 'FAILED',
            error_code = 'LESSON_GENERATION_INTERRUPTED',
            error_message = 'Lesson generation was interrupted. Retry the item.',
            completed_at = ?, updated_at = ?
        WHERE id = ?
      `).run(timestamp, timestamp, job.id);

      db.prepare(`
        UPDATE inbox_items
        SET status = 'LESSON_FAILED',
            error_code = 'LESSON_GENERATION_INTERRUPTED',
            error_message = 'Lesson generation was interrupted. Retry the item.',
            updated_at = ?
        WHERE id = ?
      `).run(timestamp, job.inboxItemId);
    }
  });

  transaction();
  return jobs.length;
}

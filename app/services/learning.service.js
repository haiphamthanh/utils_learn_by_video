import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { getDatabase } from "../db/database.js";

const JOURNAL_FIELDS = {
  whyISavedThis: "WHY_I_SAVED",
  myThought: "MY_THOUGHT",
  favoritePhrase: "FAVORITE_PHRASE",
  myExample: "MY_EXAMPLE"
};

const PROGRESS_ACTIONS = new Set([
  "OPENED",
  "LISTEN_COMPLETED",
  "SHADOW_COMPLETED",
  "MARK_LEARNING",
  "MARK_MASTERED"
]);

function nowIso() {
  return new Date().toISOString();
}

function learningError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function getLessonRecord(lessonId) {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT
      l.id,
      l.inbox_item_id AS inboxItemId,
      l.transcript_id AS transcriptId,
      l.title,
      l.summary_vi AS summaryVi,
      l.topic,
      l.difficulty,
      l.provider,
      l.model,
      l.status,
      l.lesson_json_path AS lessonJsonPath,
      l.created_at AS createdAt,
      s.type AS sourceType,
      s.url AS sourceUrl,
      s.title AS sourceTitle,
      s.platform AS sourcePlatform,
      m.normalized_video_path AS videoPath,
      m.normalized_audio_path AS audioPath,
      m.poster_path AS posterPath,
      m.duration_ms AS durationMs
    FROM lessons l
    JOIN inbox_items i ON i.id = l.inbox_item_id
    LEFT JOIN sources s ON s.id = i.source_id
    LEFT JOIN media_assets m ON m.inbox_item_id = i.id
    WHERE l.id = ?
  `).get(lessonId);

  if (!row) {
    throw learningError("LESSON_NOT_FOUND", "Lesson not found.", 404);
  }

  return row;
}

function readArtifact(record) {
  if (!record.lessonJsonPath || !fs.existsSync(record.lessonJsonPath)) {
    throw learningError(
      "LESSON_ARTIFACT_NOT_FOUND",
      "The lesson artifact could not be found on disk.",
      404
    );
  }

  return JSON.parse(fs.readFileSync(record.lessonJsonPath, "utf-8"));
}

function readJournal(lessonId, artifactJournal = {}) {
  const db = getDatabase();
  const values = {
    whyISavedThis: artifactJournal.whyISavedThis || "",
    myThought: artifactJournal.myThought || "",
    favoritePhrase: artifactJournal.favoritePhrase || "",
    myExample: artifactJournal.myExample || ""
  };

  const rows = db.prepare(`
    SELECT entry_type AS entryType, content
    FROM journal_entries
    WHERE lesson_id = ?
  `).all(lessonId);

  const reverse = Object.fromEntries(
    Object.entries(JOURNAL_FIELDS).map(([field, type]) => [type, field])
  );

  for (const row of rows) {
    const field = reverse[row.entryType];
    if (field) values[field] = row.content || "";
  }

  return values;
}

function readProgress(lessonId, artifactProgress = {}) {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT
      learning_status AS status,
      listen_count AS listenCount,
      shadow_count AS shadowCount,
      last_opened_at AS lastOpenedAt,
      last_completed_at AS lastCompletedAt
    FROM learning_progress
    WHERE lesson_id = ?
  `).get(lessonId);

  return row || {
    status: artifactProgress.status || "NEW",
    listenCount: Number(artifactProgress.listenCount || 0),
    shadowCount: Number(artifactProgress.shadowCount || 0),
    lastOpenedAt: null,
    lastCompletedAt: null
  };
}

function writeArtifactState(record, artifact, journal, progress) {
  artifact.journal = journal;
  artifact.progress = {
    status: progress.status,
    listenCount: progress.listenCount,
    shadowCount: progress.shadowCount,
    lastOpenedAt: progress.lastOpenedAt,
    lastCompletedAt: progress.lastCompletedAt
  };

  const tempPath = `${record.lessonJsonPath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(artifact, null, 2), "utf-8");
  fs.renameSync(tempPath, record.lessonJsonPath);
}

export function listLessons({ q = "", status = "", limit = 100 } = {}) {
  const db = getDatabase();
  const normalizedQuery = String(q || "").trim();
  const normalizedStatus = String(status || "").trim().toUpperCase();
  const parsedLimit = Number(limit || 100);
  const safeLimit = Number.isFinite(parsedLimit)
    ? Math.max(1, Math.min(200, parsedLimit))
    : 100;

  let sql = `
    SELECT
      l.id,
      l.inbox_item_id AS inboxItemId,
      l.transcript_id AS transcriptId,
      l.lesson_json_path AS lessonJsonPath,
      l.title,
      l.summary_vi AS summaryVi,
      l.topic,
      l.difficulty,
      l.provider,
      l.model,
      l.created_at AS createdAt,
      s.type AS sourceType,
      s.url AS sourceUrl,
      s.platform AS sourcePlatform,
      m.duration_ms AS durationMs,
      CASE WHEN m.normalized_video_path IS NOT NULL THEN 1 ELSE 0 END AS hasVideo,
      CASE WHEN m.normalized_audio_path IS NOT NULL THEN 1 ELSE 0 END AS hasAudio,
      CASE WHEN m.poster_path IS NOT NULL THEN 1 ELSE 0 END AS hasPoster,
      COALESCE(lp.learning_status, 'NEW') AS learningStatus,
      COALESCE(lp.listen_count, 0) AS listenCount,
      COALESCE(lp.shadow_count, 0) AS shadowCount,
      lp.last_opened_at AS lastOpenedAt
    FROM lessons l
    JOIN inbox_items i ON i.id = l.inbox_item_id
    LEFT JOIN sources s ON s.id = i.source_id
    LEFT JOIN media_assets m ON m.inbox_item_id = i.id
    LEFT JOIN learning_progress lp ON lp.lesson_id = l.id
    WHERE l.id = (
      SELECT l2.id
      FROM lessons l2
      WHERE l2.inbox_item_id = l.inbox_item_id
      ORDER BY l2.created_at DESC
      LIMIT 1
    )
  `;

  const params = [];

  if (normalizedStatus) {
    sql += " AND COALESCE(lp.learning_status, 'NEW') = ?";
    params.push(normalizedStatus);
  }

  sql += `
    ORDER BY
      CASE WHEN lp.last_opened_at IS NULL THEN 0 ELSE 1 END,
      lp.last_opened_at ASC,
      l.created_at DESC
    LIMIT ?
  `;
  params.push(normalizedQuery ? 200 : safeLimit);

  let rows = db.prepare(sql).all(...params);

  if (normalizedQuery) {
    const needle = normalizedQuery.toLocaleLowerCase();
    rows = rows.filter((row) => {
      const transcriptText = db.prepare(`
        SELECT GROUP_CONCAT(COALESCE(reviewed_text, cleaned_text, raw_text), ' ') AS value
        FROM transcript_segments
        WHERE transcript_id = ?
      `).get(row.transcriptId)?.value || "";

      const journalText = db.prepare(`
        SELECT GROUP_CONCAT(content, ' ') AS value
        FROM journal_entries
        WHERE lesson_id = ?
      `).get(row.id)?.value || "";

      let generatedText = "";
      try {
        const artifact = JSON.parse(fs.readFileSync(row.lessonJsonPath, "utf-8"));
        const learning = artifact.learning || {};
        generatedText = [
          ...(learning.keyPhrases || []).flatMap((item) => [
            item.phrase,
            item.meaningVi,
            item.whyUseful
          ]),
          ...(learning.patterns || []).flatMap((item) => [
            item.pattern,
            item.explanationVi,
            item.example
          ])
        ].filter(Boolean).join(" ");
      } catch {
        generatedText = "";
      }

      return [
        row.title,
        row.summaryVi,
        row.topic,
        transcriptText,
        journalText,
        generatedText
      ].filter(Boolean).join(" ").toLocaleLowerCase().includes(needle);
    }).slice(0, safeLimit);
  }

  return rows.map((row) => ({
    ...row,
    lessonJsonPath: undefined,
    transcriptId: undefined,
    media: {
      videoUrl: row.hasVideo ? `/api/lessons/${row.id}/media/video` : null,
      audioUrl: row.hasAudio ? `/api/lessons/${row.id}/media/audio` : null,
      posterUrl: row.hasPoster ? `/api/lessons/${row.id}/media/poster` : null
    }
  }));
}

export function getLessonDetail(lessonId) {
  const record = getLessonRecord(lessonId);
  const artifact = readArtifact(record);
  const journal = readJournal(lessonId, artifact.journal || {});
  const progress = readProgress(lessonId, artifact.progress || {});

  return {
    ...artifact,
    media: {
      durationMs: record.durationMs
    },
    journal,
    progress,
    mediaUrls: {
      video: record.videoPath ? `/api/lessons/${lessonId}/media/video` : null,
      audio: record.audioPath ? `/api/lessons/${lessonId}/media/audio` : null,
      poster: record.posterPath ? `/api/lessons/${lessonId}/media/poster` : null
    }
  };
}

export function updateLessonJournal(lessonId, payload = {}) {
  const record = getLessonRecord(lessonId);
  const artifact = readArtifact(record);
  const db = getDatabase();
  const timestamp = nowIso();

  const entries = Object.entries(JOURNAL_FIELDS)
    .filter(([field]) => Object.prototype.hasOwnProperty.call(payload, field))
    .map(([field, entryType]) => ({
      entryType,
      content: String(payload[field] ?? "").trim()
    }));

  if (entries.length === 0) {
    throw learningError("JOURNAL_EMPTY", "No journal fields were provided.");
  }

  const upsert = db.prepare(`
    INSERT INTO journal_entries (
      id, lesson_id, entry_type, content, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(lesson_id, entry_type)
    DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at
  `);

  const transaction = db.transaction(() => {
    for (const entry of entries) {
      upsert.run(
        `journal_${crypto.randomUUID()}`,
        lessonId,
        entry.entryType,
        entry.content,
        timestamp,
        timestamp
      );
    }
  });

  transaction();

  const journal = readJournal(lessonId, artifact.journal || {});
  const progress = readProgress(lessonId, artifact.progress || {});
  writeArtifactState(record, artifact, journal, progress);
  return journal;
}

export function recordLessonProgress(lessonId, action) {
  if (!PROGRESS_ACTIONS.has(action)) {
    throw learningError("PROGRESS_ACTION_INVALID", "Unsupported progress action.");
  }

  const record = getLessonRecord(lessonId);
  const artifact = readArtifact(record);
  const db = getDatabase();
  const timestamp = nowIso();
  const current = readProgress(lessonId, artifact.progress || {});

  const next = { ...current };

  if (action === "OPENED") {
    next.status = current.status === "NEW" ? "LEARNING" : current.status;
    next.lastOpenedAt = timestamp;
  } else if (action === "LISTEN_COMPLETED") {
    next.status = current.status === "MASTERED" ? "MASTERED" : "LEARNING";
    next.listenCount += 1;
    next.lastCompletedAt = timestamp;
  } else if (action === "SHADOW_COMPLETED") {
    next.status = current.status === "MASTERED" ? "MASTERED" : "LEARNING";
    next.shadowCount += 1;
    next.lastCompletedAt = timestamp;
  } else if (action === "MARK_LEARNING") {
    next.status = "LEARNING";
  } else if (action === "MARK_MASTERED") {
    next.status = "MASTERED";
    next.lastCompletedAt = timestamp;
  }

  db.prepare(`
    INSERT INTO learning_progress (
      lesson_id, learning_status, listen_count, shadow_count,
      last_opened_at, last_completed_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(lesson_id)
    DO UPDATE SET
      learning_status = excluded.learning_status,
      listen_count = excluded.listen_count,
      shadow_count = excluded.shadow_count,
      last_opened_at = excluded.last_opened_at,
      last_completed_at = excluded.last_completed_at
  `).run(
    lessonId,
    next.status,
    next.listenCount,
    next.shadowCount,
    next.lastOpenedAt,
    next.lastCompletedAt
  );

  const journal = readJournal(lessonId, artifact.journal || {});
  writeArtifactState(record, artifact, journal, next);
  return next;
}

export function getLessonMedia(lessonId, kind) {
  const record = getLessonRecord(lessonId);
  const media = {
    video: {
      filePath: record.videoPath,
      contentType: "video/mp4"
    },
    audio: {
      filePath: record.audioPath,
      contentType: "audio/wav"
    },
    poster: {
      filePath: record.posterPath,
      contentType: "image/jpeg"
    }
  }[kind];

  if (!media) {
    throw learningError("MEDIA_KIND_INVALID", "Unsupported lesson media kind.", 404);
  }

  if (!media.filePath || !fs.existsSync(media.filePath)) {
    throw learningError("LESSON_MEDIA_NOT_FOUND", "Lesson media not found.", 404);
  }

  return {
    ...media,
    filePath: path.resolve(media.filePath),
    size: fs.statSync(media.filePath).size
  };
}

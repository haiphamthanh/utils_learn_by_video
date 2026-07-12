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
  "MARK_MASTERED",
  "TOGGLE_FAVORITE"
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
      i.personal_note AS personalNote,
      s.id AS sourceId,
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
      is_favorite AS isFavorite,
      listen_count AS listenCount,
      shadow_count AS shadowCount,
      last_opened_at AS lastOpenedAt,
      last_completed_at AS lastCompletedAt
    FROM learning_progress
    WHERE lesson_id = ?
  `).get(lessonId);

  if (row) {
    return {
      ...row,
      isFavorite: Boolean(row.isFavorite)
    };
  }

  return {
    status: artifactProgress.status || "NEW",
    isFavorite: Boolean(artifactProgress.isFavorite),
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
    isFavorite: Boolean(progress.isFavorite),
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
      COALESCE(lp.is_favorite, 0) AS isFavorite,
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
    isFavorite: Boolean(row.isFavorite),
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

export function updateLessonMetadata(lessonId, payload = {}) {
  const record = getLessonRecord(lessonId);
  const artifact = readArtifact(record);
  const db = getDatabase();
  const timestamp = nowIso();
  const title = String(payload.title ?? artifact.lesson?.title ?? record.title ?? "Lesson")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  const summaryVi = String(payload.summaryVi ?? artifact.learning?.summaryVi ?? record.summaryVi ?? "")
    .trim()
    .slice(0, 1200);
  const sourceTitle = String(payload.sourceTitle ?? record.sourceTitle ?? title)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
  const personalNote = String(payload.personalNote ?? record.personalNote ?? "")
    .trim()
    .slice(0, 4000);

  if (!title) {
    throw learningError("LESSON_TITLE_REQUIRED", "Lesson title is required.");
  }

  const transaction = db.transaction(() => {
    db.prepare(`
      UPDATE lessons
      SET title = ?, summary_vi = ?, updated_at = ?
      WHERE id = ?
    `).run(title, summaryVi, timestamp, lessonId);

    db.prepare(`
      UPDATE inbox_items
      SET personal_note = ?, updated_at = ?
      WHERE id = ?
    `).run(personalNote, timestamp, record.inboxItemId);

    if (record.sourceId) {
      db.prepare(`
        UPDATE sources
        SET title = ?
        WHERE id = ?
      `).run(sourceTitle || title, record.sourceId);
    }
  });

  transaction();

  artifact.lesson = {
    ...(artifact.lesson || {}),
    title
  };
  artifact.learning = {
    ...(artifact.learning || {}),
    summaryVi
  };
  artifact.source = {
    ...(artifact.source || {}),
    title: sourceTitle || title
  };
  fs.writeFileSync(record.lessonJsonPath, JSON.stringify(artifact, null, 2), "utf-8");

  return {
    title,
    summaryVi,
    sourceTitle: sourceTitle || title,
    personalNote
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
  } else if (action === "TOGGLE_FAVORITE") {
    next.isFavorite = !Boolean(current.isFavorite);
  }

  db.prepare(`
    INSERT INTO learning_progress (
      lesson_id, learning_status, is_favorite, listen_count, shadow_count,
      last_opened_at, last_completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(lesson_id)
    DO UPDATE SET
      learning_status = excluded.learning_status,
      is_favorite = excluded.is_favorite,
      listen_count = excluded.listen_count,
      shadow_count = excluded.shadow_count,
      last_opened_at = excluded.last_opened_at,
      last_completed_at = excluded.last_completed_at
  `).run(
    lessonId,
    next.status,
    Boolean(next.isFavorite) ? 1 : 0,
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

export function listJournalEntries({ q = "" } = {}) {
  const db = getDatabase();
  const normalizedQuery = String(q || "").trim();

  const rows = db.prepare(`
    SELECT
      je.id,
      je.lesson_id AS lessonId,
      je.entry_type AS entryType,
      je.content,
      je.updated_at AS updatedAt,
      l.title AS lessonTitle,
      l.summary_vi AS lessonSummaryVi,
      l.inbox_item_id AS inboxItemId
    FROM journal_entries je
    JOIN lessons l ON l.id = je.lesson_id
    WHERE l.id = (
      SELECT l2.id FROM lessons l2
      WHERE l2.inbox_item_id = l.inbox_item_id
      ORDER BY l2.created_at DESC LIMIT 1
    )
      AND je.content IS NOT NULL
      AND je.content != ''
    ORDER BY je.updated_at DESC
  `).all();

  const journalReverse = Object.fromEntries(
    Object.entries(JOURNAL_FIELDS).map(([field, type]) => [type, field])
  );

  const entries = rows.map((row) => ({
    id: row.id,
    lessonId: row.lessonId,
    inboxItemId: row.inboxItemId,
    field: journalReverse[row.entryType] || row.entryType,
    entryType: row.entryType,
    content: row.content,
    lessonTitle: row.lessonTitle,
    lessonSummaryVi: row.lessonSummaryVi,
    updatedAt: row.updatedAt
  }));

  if (normalizedQuery) {
    const needle = normalizedQuery.toLocaleLowerCase();
    return entries.filter((entry) =>
      entry.content.toLocaleLowerCase().includes(needle) ||
      entry.lessonTitle.toLocaleLowerCase().includes(needle)
    );
  }

  return entries;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function daySeed() {
  let hash = 0;
  for (const char of todayDate()) {
    hash = ((hash << 5) - hash) + char.charCodeAt(0);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getJournalOverview({ month, year, period = "month" } = {}) {
  const db = getDatabase();
  const date = todayDate();
  const seed = daySeed();

  const now = new Date();
  const selMonth = month != null ? Number(month) : now.getMonth() + 1;
  const selYear = year != null ? Number(year) : now.getFullYear();

  const stats = db.prepare(`
    SELECT
      COALESCE(SUM(lp.listen_count), 0) AS totalListens,
      COALESCE(SUM(lp.shadow_count), 0) AS totalLoops,
      (SELECT COUNT(*) FROM journal_entries WHERE entry_type = 'FAVORITE_PHRASE' AND content != '') AS totalPhrases
    FROM learning_progress lp
    JOIN lessons l ON l.id = lp.lesson_id
    WHERE l.id = (
      SELECT l2.id FROM lessons l2 WHERE l2.inbox_item_id = l.inbox_item_id ORDER BY l2.created_at DESC LIMIT 1
    )
  `).get();

  const recentLessons = db.prepare(`
    SELECT
      l.id,
      l.title,
      l.inbox_item_id AS inboxItemId,
      l.difficulty,
      COALESCE(lp.learning_status, 'NEW') AS learningStatus,
      lp.listen_count AS listenCount,
      lp.shadow_count AS shadowCount,
      lp.last_opened_at AS lastOpenedAt,
      m.duration_ms AS durationMs,
      CASE WHEN m.normalized_video_path IS NOT NULL THEN 1 ELSE 0 END AS hasVideo,
      CASE WHEN m.poster_path IS NOT NULL THEN 1 ELSE 0 END AS hasPoster
    FROM lessons l
    JOIN inbox_items i ON i.id = l.inbox_item_id
    LEFT JOIN media_assets m ON m.inbox_item_id = i.id
    LEFT JOIN learning_progress lp ON lp.lesson_id = l.id
    WHERE l.id = (
      SELECT l2.id FROM lessons l2 WHERE l2.inbox_item_id = l.inbox_item_id ORDER BY l2.created_at DESC LIMIT 1
    )
      AND lp.last_opened_at IS NOT NULL
    ORDER BY lp.last_opened_at DESC
    LIMIT 8
  `).all();

  const mappedRecent = recentLessons.map((l) => ({
    ...l,
    hasVideo: Number(l.hasVideo) === 1,
    hasPoster: Number(l.hasPoster) === 1,
    mediaUrls: {
      poster: l.hasPoster ? `/api/lessons/${l.id}/media/poster` : null
    }
  }));

  const inProgress = mappedRecent.length > 0
    ? mappedRecent.find((l) => l.learningStatus !== "MASTERED") || mappedRecent[0]
    : null;

  const randomLesson = db.prepare(`
    SELECT
      l.id,
      l.title,
      l.inbox_item_id AS inboxItemId,
      l.difficulty,
      m.duration_ms AS durationMs,
      CASE WHEN m.poster_path IS NOT NULL THEN 1 ELSE 0 END AS hasPoster
    FROM lessons l
    JOIN inbox_items i ON i.id = l.inbox_item_id
    LEFT JOIN media_assets m ON m.inbox_item_id = i.id
    LEFT JOIN learning_progress lp ON lp.lesson_id = l.id
    WHERE l.id = (
      SELECT l2.id FROM lessons l2 WHERE l2.inbox_item_id = l.inbox_item_id ORDER BY l2.created_at DESC LIMIT 1
    )
      AND (lp.learning_status IS NULL OR lp.learning_status != 'MASTERED')
    ORDER BY RANDOM()
    LIMIT 1
  `).get();

  const phrases = db.prepare(`
    SELECT je.content, je.lesson_id AS lessonId, l.title AS lessonTitle
    FROM journal_entries je
    JOIN lessons l ON l.id = je.lesson_id
    WHERE je.entry_type = 'FAVORITE_PHRASE' AND je.content != ''
      AND l.id = (
        SELECT l2.id FROM lessons l2 WHERE l2.inbox_item_id = l.inbox_item_id ORDER BY l2.created_at DESC LIMIT 1
      )
    ORDER BY je.updated_at DESC
  `).all();

  let phraseOfDay = null;
  if (phrases.length > 0) {
    const index = seed % phrases.length;
    phraseOfDay = {
      content: phrases[index].content,
      lessonId: phrases[index].lessonId,
      lessonTitle: phrases[index].lessonTitle
    };
  }

  const openedDates = db.prepare(`
    SELECT DISTINCT substr(last_opened_at, 1, 10) AS openDate
    FROM learning_progress
    WHERE last_opened_at IS NOT NULL
    ORDER BY openDate DESC
  `).all().map((r) => r.openDate);

  let streak = 0;
  if (openedDates.length > 0) {
    const todayStr = todayDate();
    const checkDate = new Date(todayStr);
    const dateSet = new Set(openedDates);

    for (let i = 0; i < 365; i++) {
      const d = checkDate.toISOString().slice(0, 10);
      if (dateSet.has(d)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        if (i === 0) break;
        break;
      }
    }
  }

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekStartStr = weekStart.toISOString().slice(0, 10);

  const weekStats = db.prepare(`
    SELECT
      COUNT(DISTINCT l.id) AS lessonsOpened,
      COALESCE(SUM(lp.listen_count), 0) AS listens,
      COALESCE(SUM(lp.shadow_count), 0) AS loops
    FROM learning_progress lp
    JOIN lessons l ON l.id = lp.lesson_id
    WHERE lp.last_opened_at >= ?
  `).get(weekStartStr);

  const weekPhrases = db.prepare(`
    SELECT COUNT(*) AS count
    FROM journal_entries
    WHERE entry_type = 'FAVORITE_PHRASE' AND content != ''
      AND updated_at >= ?
  `).get(weekStartStr);

  const dailyActivity = [];
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let periodLabel = "";

  if (period === "day") {
    const d = new Date();
    const ds = d.toISOString().slice(0, 10);
    const daily = db.prepare(`
      SELECT COALESCE(SUM(lp.listen_count), 0) AS listens, COALESCE(SUM(lp.shadow_count), 0) AS loops
      FROM learning_progress lp JOIN lessons l ON l.id = lp.lesson_id
      WHERE substr(lp.last_opened_at, 1, 10) = ?
        AND l.id = (SELECT l2.id FROM lessons l2 WHERE l2.inbox_item_id = l.inbox_item_id ORDER BY l2.created_at DESC LIMIT 1)
    `).get(ds);
    dailyActivity.push({ date: ds, label: d.toLocaleDateString("en-US", { weekday: "short" }), listens: daily.listens, loops: daily.loops });
    periodLabel = d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  } else if (period === "week") {
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      const daily = db.prepare(`
        SELECT COALESCE(SUM(lp.listen_count), 0) AS listens, COALESCE(SUM(lp.shadow_count), 0) AS loops
        FROM learning_progress lp JOIN lessons l ON l.id = lp.lesson_id
        WHERE substr(lp.last_opened_at, 1, 10) = ?
          AND l.id = (SELECT l2.id FROM lessons l2 WHERE l2.inbox_item_id = l.inbox_item_id ORDER BY l2.created_at DESC LIMIT 1)
      `).get(ds);
      dailyActivity.push({ date: ds, label: d.toLocaleDateString("en-US", { weekday: "short" }), listens: daily.listens, loops: daily.loops });
    }
    periodLabel = "Last 7 days";
  } else {
    const daysInMonth = new Date(selYear, selMonth, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const ds = `${String(selYear).padStart(4, "0")}-${String(selMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const daily = db.prepare(`
        SELECT COALESCE(SUM(lp.listen_count), 0) AS listens, COALESCE(SUM(lp.shadow_count), 0) AS loops
        FROM learning_progress lp JOIN lessons l ON l.id = lp.lesson_id
        WHERE substr(lp.last_opened_at, 1, 10) = ?
          AND l.id = (SELECT l2.id FROM lessons l2 WHERE l2.inbox_item_id = l.inbox_item_id ORDER BY l2.created_at DESC LIMIT 1)
      `).get(ds);
      dailyActivity.push({ date: ds, label: String(day), listens: daily.listens, loops: daily.loops });
    }
    periodLabel = `${monthNames[selMonth - 1]} ${selYear}`;
  }

  const monthTotal = {
    listens: dailyActivity.reduce((s, d) => s + d.listens, 0),
    loops: dailyActivity.reduce((s, d) => s + d.loops, 0)
  };

  return {
    stats: {
      totalListens: stats.totalListens,
      totalLoops: stats.totalLoops,
      totalPhrases: stats.totalPhrases,
      streak
    },
    selectedMonth: { month: selMonth, year: selYear, label: periodLabel },
    period,
    monthTotal,
    inProgress,
    recentLessons: mappedRecent,
    randomLesson: randomLesson ? {
      ...randomLesson,
      hasPoster: Number(randomLesson.hasPoster) === 1,
      mediaUrls: {
        poster: randomLesson.hasPoster ? `/api/lessons/${randomLesson.id}/media/poster` : null
      }
    } : null,
    phraseOfDay,
    weekRecap: {
      lessonsOpened: weekStats.lessonsOpened,
      listens: weekStats.listens,
      loops: weekStats.loops,
      phrasesSaved: weekPhrases.count
    },
    dailyActivity
  };
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.error?.message || `Request failed with status ${response.status}.`;
    throw new Error(message);
  }

  return payload.data;
}

export function listInbox(status = "") {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return request(`/api/inbox${query}`);
}

export function createInbox(payload) {
  return request("/api/inbox", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function deleteInbox(inboxId) {
  return request(`/api/inbox/${inboxId}`, { method: "DELETE" });
}

export function uploadMedia(inboxId, file) {
  const body = new FormData();
  body.append("media", file);
  return request(`/api/inbox/${inboxId}/media`, { method: "POST", body });
}

export function startAutomaticAnalysis(inboxId) {
  return request(`/api/inbox/${inboxId}/auto-process`, { method: "POST" });
}

export function processMedia(inboxId) {
  return request(`/api/inbox/${inboxId}/process`, { method: "POST" });
}

export function transcribeMedia(inboxId) {
  return request(`/api/inbox/${inboxId}/transcribe`, { method: "POST" });
}

export function getTranscript(inboxId) {
  return request(`/api/inbox/${inboxId}/transcript`);
}

export function updateTranscriptSegment(inboxId, segmentId, reviewedText) {
  return request(`/api/inbox/${inboxId}/transcript/segments/${segmentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reviewedText })
  });
}

export function generateLesson(inboxId) {
  return request(`/api/inbox/${inboxId}/lesson/generate`, { method: "POST" });
}

export function getLesson(inboxId) {
  return request(`/api/inbox/${inboxId}/lesson`);
}

export function listLessons({ q = "", status = "", favorite = false, tag = "", limit = 100 } = {}) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  if (favorite) params.set("favorite", "1");
  if (tag) params.set("tag", tag);
  if (limit) params.set("limit", String(limit));
  const query = params.toString();
  return request(`/api/lessons${query ? `?${query}` : ""}`);
}

export function listTags() {
  return request("/api/lessons/tags");
}

export function getLessonDetail(lessonId) {
  return request(`/api/lessons/${lessonId}`);
}

export function updateLessonJournal(lessonId, payload) {
  return request(`/api/lessons/${lessonId}/journal`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function listLessonNotes(lessonId, { includeHidden = false } = {}) {
  const query = includeHidden ? "?includeHidden=1" : "";
  return request(`/api/lessons/${lessonId}/notes${query}`);
}

export function createLessonNote(lessonId, payload) {
  return request(`/api/lessons/${lessonId}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function updateLessonNote(lessonId, noteId, payload) {
  return request(`/api/lessons/${lessonId}/notes/${encodeURIComponent(noteId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function deleteLessonNote(lessonId, noteId) {
  return request(`/api/lessons/${lessonId}/notes/${encodeURIComponent(noteId)}`, {
    method: "DELETE"
  });
}

export function updateLessonMetadata(lessonId, payload) {
  return request(`/api/lessons/${lessonId}/metadata`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function updateLessonTags(lessonId, tags) {
  return request(`/api/lessons/${lessonId}/tags`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tags })
  });
}

export function updateLessonProgress(lessonId, action) {
  return request(`/api/lessons/${lessonId}/progress`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action })
  });
}

export function listShareRegistry(status = "") {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return request(`/api/share/registry${query}`);
}

export function listShareExports() {
  return request("/api/share/exports");
}

export function deleteShareExport(filename) {
  return request(`/api/share/exports/${encodeURIComponent(filename)}`, { method: "DELETE" });
}

export function restoreShareTombstone(slug) {
  return request(`/api/share/registry/${encodeURIComponent(slug)}/restore`, { method: "POST" });
}

export function createShareExport(payload = {}) {
  return request("/api/share/exports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function getShareExportDownloadUrl(filename) {
  return `/api/share/exports/${encodeURIComponent(filename)}/download`;
}

export function importShareZip(file, dryRun = false) {
  const body = new FormData();
  body.append("file", file);
  if (dryRun) body.append("dryRun", "true");
  return request("/api/share/imports", { method: "POST", body });
}

export function listExportableLessons() {
  return request("/api/share/exportable");
}

export function listJournalEntries(q = "") {
  const query = q ? `?q=${encodeURIComponent(q)}` : "";
  return request(`/api/journal${query}`);
}

export function getJournalOverview(period = "month", month, year) {
  const params = new URLSearchParams();
  params.set("period", period);
  if (month != null) params.set("month", month);
  if (year != null) params.set("year", year);
  return request(`/api/journal/overview?${params.toString()}`);
}

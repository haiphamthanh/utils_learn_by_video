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

export function uploadMedia(inboxId, file) {
  const body = new FormData();
  body.append("media", file);
  return request(`/api/inbox/${inboxId}/media`, { method: "POST", body });
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

export function listLessons({ q = "", status = "", limit = 100 } = {}) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  if (limit) params.set("limit", String(limit));
  const query = params.toString();
  return request(`/api/lessons${query ? `?${query}` : ""}`);
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

export function updateLessonProgress(lessonId, action) {
  return request(`/api/lessons/${lessonId}/progress`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action })
  });
}

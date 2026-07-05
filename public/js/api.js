async function request(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload?.error?.message || `Request failed with status ${response.status}.`;
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
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export function uploadMedia(inboxId, file) {
  const body = new FormData();
  body.append("media", file);

  return request(`/api/inbox/${inboxId}/media`, {
    method: "POST",
    body
  });
}

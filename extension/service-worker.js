const DEFAULT_API_BASE_URL = "http://localhost:9090";
const LEGACY_API_BASE_URL = "http://localhost:3000";
const REQUEST_TIMEOUT_MS = 6000;

chrome.runtime.onInstalled.addListener(() => {
  void ensureDefaultSettings();
});

chrome.runtime.onStartup.addListener(() => {
  void ensureDefaultSettings();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void handleMessage(message)
    .then(sendResponse)
    .catch((error) => {
      sendResponse({
        ok: false,
        error: normalizeError(error),
      });
    });

  return true;
});

async function handleMessage(message = {}) {
  switch (message.type) {
    case "GET_SETTINGS":
      return {
        ok: true,
        data: await getSettings(),
      };

    case "SAVE_SETTINGS": {
      const apiBaseUrl = normalizeApiBaseUrl(message.apiBaseUrl);
      await chrome.storage.local.set({ apiBaseUrl });
      return {
        ok: true,
        data: { apiBaseUrl },
      };
    }

    case "HEALTH_CHECK": {
      const settings = await getSettings();
      const data = await apiRequest(settings.apiBaseUrl, "/api/health");
      return { ok: true, data };
    }

    case "SAVE_CAPTURE": {
      const capture = validateCapture(message.capture);
      const settings = await getSettings();
      const data = await apiRequest(settings.apiBaseUrl, "/api/inbox", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source: {
            type: capture.sourceType,
            url: capture.url,
            title: capture.title,
            platform: capture.platform,
            capturedAt: new Date().toISOString(),
          },
          language: capture.language,
          personalNote: capture.personalNote,
          autoProcess: true,
        }),
      });

      await showSavedBadge();
      return {
        ok: true,
        data: {
          item: data,
          inboxUrl: `${settings.apiBaseUrl}/?page=inbox`,
        },
      };
    }

    default:
      throw createError(
        "MESSAGE_UNSUPPORTED",
        "Unsupported extension request.",
      );
  }
}

async function ensureDefaultSettings() {
  const stored = await chrome.storage.local.get(["apiBaseUrl"]);
  if (!stored.apiBaseUrl) {
    await chrome.storage.local.set({ apiBaseUrl: DEFAULT_API_BASE_URL });
    return;
  }
  if (stored.apiBaseUrl === LEGACY_API_BASE_URL || stored.apiBaseUrl === `${LEGACY_API_BASE_URL}/`) {
    await chrome.storage.local.set({ apiBaseUrl: DEFAULT_API_BASE_URL });
  }
}

async function getSettings() {
  const stored = await chrome.storage.local.get(["apiBaseUrl"]);
  let apiBaseUrl = stored.apiBaseUrl || DEFAULT_API_BASE_URL;
  if (apiBaseUrl === LEGACY_API_BASE_URL || apiBaseUrl === `${LEGACY_API_BASE_URL}/`) {
    apiBaseUrl = DEFAULT_API_BASE_URL;
    await chrome.storage.local.set({ apiBaseUrl: DEFAULT_API_BASE_URL });
  }
  return {
    apiBaseUrl: normalizeApiBaseUrl(apiBaseUrl),
  };
}

function normalizeApiBaseUrl(input) {
  const value = String(input || DEFAULT_API_BASE_URL)
    .trim()
    .replace(/\/+$/, "");
  let parsed;

  try {
    parsed = new URL(value);
  } catch {
    throw createError(
      "API_URL_INVALID",
      "Use a valid local Enjoy Journal URL.",
    );
  }

  if (parsed.protocol !== "http:") {
    throw createError(
      "API_URL_INVALID",
      "The MVP extension supports local HTTP only.",
    );
  }

  if (!["localhost", "127.0.0.1"].includes(parsed.hostname)) {
    throw createError(
      "API_URL_NOT_LOCAL",
      "The MVP extension only connects to localhost or 127.0.0.1.",
    );
  }

  parsed.pathname = "";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

function validateCapture(input = {}) {
  const sourceType = String(input.sourceType || "other-url");
  const allowedSourceTypes = new Set([
    "facebook-reel",
    "youtube-short",
    "other-url",
  ]);

  if (!allowedSourceTypes.has(sourceType)) {
    throw createError("SOURCE_TYPE_INVALID", "Unsupported source type.");
  }

  let url;
  try {
    url = new URL(String(input.url || ""));
  } catch {
    throw createError(
      "SOURCE_URL_INVALID",
      "This page does not have a valid web URL.",
    );
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw createError("SOURCE_URL_INVALID", "Only web pages can be saved.");
  }

  const language = String(input.language || "").trim().toLowerCase();
  if (!["en", "ja", "zh"].includes(language)) {
    throw createError(
      "SOURCE_LANGUAGE_INVALID",
      "Choose English, Japanese, or Chinese before saving.",
    );
  }

  return {
    sourceType,
    platform: input.platform ? String(input.platform) : null,
    url: url.toString(),
    title:
      String(input.title || "")
        .trim()
        .slice(0, 500) || null,
    language,
    personalNote: String(input.personalNote || "")
      .trim()
      .slice(0, 4000),
  };
}

async function apiRequest(baseUrl, pathname, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}${pathname}`, {
      ...options,
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw createError(
        payload?.error?.code || "API_REQUEST_FAILED",
        payload?.error?.message || `Enjoy Journal returned ${response.status}.`,
      );
    }

    return payload?.data ?? null;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw createError(
        "SERVER_TIMEOUT",
        "Enjoy Journal did not respond. Make sure ./start.sh is running.",
      );
    }

    if (error?.code) throw error;

    throw createError(
      "SERVER_UNREACHABLE",
      `Cannot reach Enjoy Journal at ${baseUrl}. Start the app and try again.`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function showSavedBadge() {
  await chrome.action.setBadgeBackgroundColor({ color: "#1f5b49" });
  await chrome.action.setBadgeText({ text: "✓" });
  setTimeout(() => {
    void chrome.action.setBadgeText({ text: "" });
  }, 1800);
}

function createError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function normalizeError(error) {
  return {
    code: error?.code || "EXTENSION_ERROR",
    message: error?.message || "The extension could not complete this request.",
  };
}

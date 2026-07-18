import {
  chooseSourceUrl,
  cleanSourceTitle,
  detectSource,
  isWebUrl
} from "./source-utils.js";

const captureForm = document.querySelector("#capture-form");
const sourceTypeLabel = document.querySelector("#source-type");
const sourceTitle = document.querySelector("#source-title");
const sourceUrl = document.querySelector("#source-url");
const pageState = document.querySelector("#page-state");
const sourceLanguage = document.querySelector("#source-language");
const personalNote = document.querySelector("#personal-note");
const message = document.querySelector("#message");
const saveButton = document.querySelector("#save-button");
const savedState = document.querySelector("#saved-state");
const openInboxButton = document.querySelector("#open-inbox-button");
const saveAnotherButton = document.querySelector("#save-another-button");
const connectionStatus = document.querySelector("#connection-status");
const apiBaseUrlInput = document.querySelector("#api-base-url");
const testConnectionButton = document.querySelector("#test-connection-button");
const saveSettingsButton = document.querySelector("#save-settings-button");

let capture = null;
let inboxUrl = null;

void initialize();

async function initialize() {
  bindEvents();

  const settingsResponse = await sendMessage({ type: "GET_SETTINGS" });
  if (settingsResponse.ok) {
    apiBaseUrlInput.value = settingsResponse.data.apiBaseUrl;
  }

  await Promise.all([
    loadCurrentPage(),
    checkConnection()
  ]);
}

function bindEvents() {
  captureForm.addEventListener("submit", handleSave);
  openInboxButton.addEventListener("click", openInbox);
  saveAnotherButton.addEventListener("click", resetSavedState);
  testConnectionButton.addEventListener("click", checkConnection);
  saveSettingsButton.addEventListener("click", saveSettings);

  personalNote.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      captureForm.requestSubmit();
    }
  });
}

async function loadCurrentPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !isWebUrl(tab.url)) {
      throw new Error("Open a regular web page before saving a moment.");
    }

    const context = await readPageContext(tab.id, tab);
    const normalizedUrl = chooseSourceUrl(tab.url, context.canonicalUrl);
    const source = detectSource(normalizedUrl);

    capture = {
      sourceType: source.type,
      platform: source.platform,
      url: normalizedUrl,
      title: cleanSourceTitle(context.title || tab.title || source.label, normalizedUrl)
    };

    sourceTypeLabel.textContent = source.label;
    sourceTitle.textContent = capture.title || source.label;
    sourceUrl.textContent = capture.url;
    pageState.textContent = "Ready";
    saveButton.disabled = false;
  } catch (error) {
    capture = null;
    sourceTypeLabel.textContent = "Unavailable";
    sourceTitle.textContent = "This page cannot be saved";
    sourceUrl.textContent = error.message;
    pageState.textContent = "Blocked";
    saveButton.disabled = true;
  }
}

async function readPageContext(tabId, tab) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        function visibleText(node) {
          const text = (node?.innerText || node?.textContent || "").replace(/\s+/g, " ").trim();
          if (!text || text.length < 4 || text.length > 180) return "";
          if (/^(facebook|reels?|watch|home|notifications)$/i.test(text)) return "";
          if (/^\d+[KMB]?\s*(comments?|shares?|likes?|views?)?$/i.test(text)) return "";
          return text;
        }

        const visibleCandidates = [
          ...document.querySelectorAll('[role="heading"], h1, h2, [data-ad-preview="message"], div[dir="auto"], span[dir="auto"]')
        ].map(visibleText).filter(Boolean);

        const title =
          visibleCandidates[0] ||
          document.querySelector('meta[property="og:title"]')?.content ||
          document.querySelector('meta[name="twitter:title"]')?.content ||
          document.title ||
          "";

        const canonicalUrl =
          document.querySelector('link[rel="canonical"]')?.href ||
          location.href;

        return { title, canonicalUrl };
      }
    });

    return results?.[0]?.result || {
      title: tab.title || "",
      canonicalUrl: tab.url || ""
    };
  } catch {
    return {
      title: tab.title || "",
      canonicalUrl: tab.url || ""
    };
  }
}


async function handleSave(event) {
  event.preventDefault();
  if (!capture) return;

  setMessage("", null);
  saveButton.disabled = true;
  saveButton.textContent = "Saving…";

  const response = await sendMessage({
    type: "SAVE_CAPTURE",
    capture: {
      ...capture,
      language: sourceLanguage.value,
      personalNote: personalNote.value
    }
  });

  if (!response.ok) {
    setMessage(response.error.message, "error");
    saveButton.disabled = false;
    saveButton.textContent = "Save & analyze";
    return;
  }

  inboxUrl = response.data.inboxUrl;
  captureForm.hidden = true;
  savedState.hidden = false;
}

async function checkConnection() {
  connectionStatus.textContent = "Checking…";
  connectionStatus.className = "connection-status is-checking";

  const response = await sendMessage({ type: "HEALTH_CHECK" });
  if (response.ok) {
    connectionStatus.textContent = "Connected";
    connectionStatus.className = "connection-status is-online";
    return true;
  }

  connectionStatus.textContent = "Offline";
  connectionStatus.className = "connection-status is-offline";
  return false;
}

async function saveSettings() {
  setMessage("", null);
  saveSettingsButton.disabled = true;
  saveSettingsButton.textContent = "Saving…";

  const response = await sendMessage({
    type: "SAVE_SETTINGS",
    apiBaseUrl: apiBaseUrlInput.value
  });

  saveSettingsButton.disabled = false;
  saveSettingsButton.textContent = "Save";

  if (!response.ok) {
    setMessage(response.error.message, "error");
    return;
  }

  apiBaseUrlInput.value = response.data.apiBaseUrl;
  setMessage("Connection settings saved.", "success");
  await checkConnection();
}

function openInbox() {
  if (!inboxUrl) return;
  void chrome.tabs.create({ url: inboxUrl });
}

function resetSavedState() {
  savedState.hidden = true;
  captureForm.hidden = false;
  personalNote.value = "";
  saveButton.textContent = "Save & analyze";
  saveButton.disabled = !capture;
  personalNote.focus();
}

function setMessage(text, type) {
  message.hidden = !text;
  message.textContent = text || "";
  message.className = `message${type ? ` is-${type}` : ""}`;
}


function sendMessage(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(payload, (response) => {
      if (chrome.runtime.lastError) {
        resolve({
          ok: false,
          error: {
            code: "MESSAGE_FAILED",
            message: chrome.runtime.lastError.message
          }
        });
        return;
      }

      resolve(response || {
        ok: false,
        error: {
          code: "EMPTY_RESPONSE",
          message: "The extension did not receive a response."
        }
      });
    });
  });
}

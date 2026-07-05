import {
  createInbox,
  getTranscript,
  listInbox,
  processMedia,
  transcribeMedia,
  uploadMedia
} from "./api.js";

const pages = [...document.querySelectorAll(".page")];
const navLinks = [...document.querySelectorAll(".nav-link")];
const dialog = document.querySelector("#capture-dialog");
const captureForm = document.querySelector("#capture-form");
const captureError = document.querySelector("#capture-error");
const inboxList = document.querySelector("#inbox-list");
const inboxCount = document.querySelector("#inbox-count");
const inboxTemplate = document.querySelector("#inbox-card-template");
const statusFilters = [...document.querySelectorAll("[data-status-filter]")];

let currentStatusFilter = "";
let activePollTimer = null;

function showPage(pageName) {
  pages.forEach((page) => {
    page.hidden = page.id !== `${pageName}-page`;
  });

  navLinks.forEach((link) => {
    link.classList.toggle("is-active", link.dataset.page === pageName);
  });

  if (pageName === "inbox") void refreshInbox();
}

function sourceName(type) {
  return {
    "facebook-reel": "Facebook Reel",
    "youtube-short": "YouTube Short",
    "other-url": "Other source",
    "local-file": "Local file",
    "uploaded-file": "Uploaded file"
  }[type] || type;
}

function statusName(status) {
  return {
    WAITING_MEDIA: "Waiting for media",
    READY_TO_PROCESS: "Ready to process",
    PROCESSING: "Processing media",
    MEDIA_READY: "Media ready",
    TRANSCRIBING: "Transcribing",
    TRANSCRIPT_READY: "Transcript ready",
    TRANSCRIPTION_FAILED: "Transcription failed",
    FAILED: "Media failed",
    NEEDS_REVIEW: "Needs review"
  }[status] || status;
}

function stageName(stage) {
  return {
    QUEUED: "Queued",
    VALIDATE: "Validating media",
    PREPARE_MEDIA: "Preparing audio and video",
    SAVE_ARTIFACTS: "Saving media artifacts",
    STARTING: "Starting transcription worker",
    LOAD_MODEL: "Loading Whisper model",
    UPLOAD_AUDIO: "Uploading audio",
    TRANSCRIBE: "Listening and transcribing",
    VALIDATE_TRANSCRIPT: "Checking timed transcript",
    SAVE_TRANSCRIPT: "Saving transcript",
    COMPLETE: "Complete",
    FAILED: "Failed"
  }[stage] || stage || "Working";
}

function displayTitle(item) {
  if (item.sourceTitle) return item.sourceTitle;

  try {
    return new URL(item.sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return "Saved source";
  }
}

function ensurePolling(items) {
  const hasActiveJob = items.some((item) =>
    ["PROCESSING", "TRANSCRIBING"].includes(item.status)
  );

  if (hasActiveJob && !activePollTimer) {
    activePollTimer = window.setInterval(() => {
      void refreshInbox({ quiet: true });
    }, 1500);
  }

  if (!hasActiveJob && activePollTimer) {
    window.clearInterval(activePollTimer);
    activePollTimer = null;
  }
}

function setProgress(item, detail, label, progressBar) {
  if (!["PROCESSING", "TRANSCRIBING"].includes(item.status)) return;

  detail.hidden = false;
  const isTranscription = item.status === "TRANSCRIBING";
  const progress = Math.max(
    0,
    Math.min(
      100,
      isTranscription
        ? item.transcriptionProgress || 0
        : item.processingProgress || 0
    )
  );
  const stage = isTranscription
    ? item.transcriptionStage
    : item.processingStage;

  progressBar.style.width = `${progress}%`;
  label.textContent = `${stageName(stage)} · ${progress}%`;
}

function formatTime(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

async function loadTranscriptPreview(item, details, providerLabel, transcriptText) {
  try {
    const transcript = await getTranscript(item.id);
    details.hidden = false;
    providerLabel.textContent =
      `${transcript.provider} · ${transcript.model} · ${transcript.segments.length} segments`;

    transcriptText.innerHTML = transcript.segments
      .slice(0, 6)
      .map((segment) => `
        <p>
          <span>${formatTime(segment.startMs)}</span>
          ${escapeHtml(segment.reviewedText || segment.cleanedText || segment.rawText)}
        </p>
      `)
      .join("");
  } catch {
    details.hidden = true;
  }
}

async function refreshInbox({ quiet = false } = {}) {
  if (!quiet) {
    inboxList.innerHTML = `<div class="empty-card"><p>Loading Inbox…</p></div>`;
  }

  try {
    const allItems = await listInbox("");
    inboxCount.textContent = allItems.length;
    ensurePolling(allItems);

    const items = currentStatusFilter
      ? allItems.filter((item) => item.status === currentStatusFilter)
      : allItems;

    if (items.length === 0) {
      inboxList.innerHTML = `
        <div class="empty-card">
          <span class="empty-icon">◎</span>
          <h3>Nothing here yet</h3>
          <p>Save one source or change the current filter.</p>
        </div>
      `;
      return;
    }

    inboxList.innerHTML = "";

    for (const item of items) {
      const fragment = inboxTemplate.content.cloneNode(true);
      const card = fragment.querySelector(".inbox-card");
      const sourceLabel = fragment.querySelector(".source-label");
      const statusBadge = fragment.querySelector(".status-badge");
      const sourceTitle = fragment.querySelector(".source-title");
      const sourceNote = fragment.querySelector(".source-note");
      const sourceLink = fragment.querySelector(".source-link");
      const mediaInput = fragment.querySelector(".media-input");
      const uploadAction = fragment.querySelector(".upload-action");
      const uploadLabel = fragment.querySelector(".upload-label");
      const mediaFilename = fragment.querySelector(".media-filename");
      const processAction = fragment.querySelector(".process-action");
      const transcribeAction = fragment.querySelector(".transcribe-action");
      const processingDetail = fragment.querySelector(".processing-detail");
      const processingLabel = fragment.querySelector(".processing-label");
      const progressBar = fragment.querySelector(".progress-bar");
      const itemError = fragment.querySelector(".item-error");
      const transcriptPreview = fragment.querySelector(".transcript-preview");
      const transcriptProvider = fragment.querySelector(".transcript-provider");
      const transcriptText = fragment.querySelector(".transcript-text");

      card.dataset.id = item.id;
      card.dataset.status = item.status;
      sourceLabel.textContent = sourceName(item.sourceType);
      statusBadge.textContent = statusName(item.status);
      sourceTitle.textContent = displayTitle(item);
      sourceNote.textContent = item.personalNote || "No note yet.";
      sourceLink.href = item.sourceUrl;
      sourceLink.hidden = !item.sourceUrl;

      if (item.mediaFilename) {
        uploadLabel.textContent = "Replace media";
        mediaFilename.textContent = item.mediaFilename;
      }

      const active = ["PROCESSING", "TRANSCRIBING"].includes(item.status);
      if (active) {
        uploadAction.hidden = true;
        processAction.hidden = true;
        transcribeAction.hidden = true;
      }

      setProgress(item, processingDetail, processingLabel, progressBar);

      if (["READY_TO_PROCESS", "FAILED"].includes(item.status)) {
        processAction.hidden = false;
        processAction.textContent =
          item.status === "FAILED"
            ? "Retry media processing"
            : "Process media";
      }

      if (["MEDIA_READY", "TRANSCRIPTION_FAILED", "TRANSCRIPT_READY"].includes(item.status)) {
        transcribeAction.hidden = false;
        transcribeAction.textContent =
          item.status === "TRANSCRIPT_READY"
            ? "Transcribe again"
            : item.status === "TRANSCRIPTION_FAILED"
              ? "Retry transcription"
              : "Create transcript";
      }

      if (item.errorMessage) {
        itemError.hidden = false;
        itemError.textContent = item.errorMessage;
      }

      if (item.status === "TRANSCRIPT_READY") {
        void loadTranscriptPreview(
          item,
          transcriptPreview,
          transcriptProvider,
          transcriptText
        );
      }

      mediaInput.disabled = active;
      mediaInput.addEventListener("change", async () => {
        const file = mediaInput.files?.[0];
        if (!file) return;

        uploadLabel.textContent = "Uploading…";
        mediaInput.disabled = true;

        try {
          await uploadMedia(item.id, file);
          await refreshInbox();
        } catch (error) {
          window.alert(error.message);
          uploadLabel.textContent = "Attach media";
          mediaInput.disabled = false;
        }
      });

      processAction.addEventListener("click", async () => {
        processAction.disabled = true;
        processAction.textContent = "Starting…";

        try {
          await processMedia(item.id);
          await refreshInbox();
        } catch (error) {
          window.alert(error.message);
          await refreshInbox();
        }
      });

      transcribeAction.addEventListener("click", async () => {
        transcribeAction.disabled = true;
        transcribeAction.textContent = "Starting…";

        try {
          await transcribeMedia(item.id);
          await refreshInbox();
        } catch (error) {
          window.alert(error.message);
          await refreshInbox();
        }
      });

      inboxList.append(fragment);
    }
  } catch (error) {
    inboxList.innerHTML = `
      <div class="empty-card">
        <h3>Inbox could not be loaded</h3>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

for (const link of navLinks) {
  link.addEventListener("click", () => showPage(link.dataset.page));
}

for (const button of document.querySelectorAll("[data-open-capture]")) {
  button.addEventListener("click", () => {
    captureError.hidden = true;
    captureForm.reset();
    dialog.showModal();
  });
}

for (const button of document.querySelectorAll("[data-close-dialog]")) {
  button.addEventListener("click", () => dialog.close());
}

for (const filter of statusFilters) {
  filter.addEventListener("click", async () => {
    currentStatusFilter = filter.dataset.statusFilter;
    statusFilters.forEach((item) => {
      item.classList.toggle("is-active", item === filter);
    });
    await refreshInbox();
  });
}

captureForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(captureForm);
  const payload = {
    source: {
      type: formData.get("sourceType"),
      url: formData.get("sourceUrl"),
      platform:
        formData.get("sourceType") === "facebook-reel"
          ? "facebook"
          : formData.get("sourceType") === "youtube-short"
            ? "youtube"
            : null
    },
    personalNote: formData.get("personalNote")
  };

  captureError.hidden = true;

  try {
    await createInbox(payload);
    dialog.close();
    showPage("inbox");
  } catch (error) {
    captureError.textContent = error.message;
    captureError.hidden = false;
  }
});

void refreshInbox();

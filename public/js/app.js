import {
  createInbox,
  listInbox,
  processMedia,
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
let processingPollTimer = null;

function showPage(pageName) {
  pages.forEach((page) => {
    page.hidden = page.id !== `${pageName}-page`;
  });

  navLinks.forEach((link) => {
    link.classList.toggle("is-active", link.dataset.page === pageName);
  });

  if (pageName === "inbox") {
    void refreshInbox();
  }
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
    PROCESSING: "Processing",
    MEDIA_READY: "Media ready",
    FAILED: "Failed",
    NEEDS_REVIEW: "Needs review"
  }[status] || status;
}

function stageName(stage) {
  return {
    QUEUED: "Queued",
    VALIDATE: "Validating media",
    PREPARE_MEDIA: "Preparing audio and video",
    SAVE_ARTIFACTS: "Saving artifacts",
    COMPLETE: "Media ready",
    FAILED: "Processing failed"
  }[stage] || stage || "Processing";
}

function displayTitle(item) {
  if (item.sourceTitle) return item.sourceTitle;

  try {
    const url = new URL(item.sourceUrl);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return "Saved source";
  }
}

function ensureProcessingPolling(items) {
  const hasProcessing = items.some((item) => item.status === "PROCESSING");

  if (hasProcessing && !processingPollTimer) {
    processingPollTimer = window.setInterval(() => {
      void refreshInbox({ quiet: true });
    }, 1500);
  }

  if (!hasProcessing && processingPollTimer) {
    window.clearInterval(processingPollTimer);
    processingPollTimer = null;
  }
}

async function refreshInbox({ quiet = false } = {}) {
  if (!quiet) {
    inboxList.innerHTML = `<div class="empty-card"><p>Loading Inbox…</p></div>`;
  }

  try {
    const allItems = await listInbox("");
    inboxCount.textContent = allItems.length;
    ensureProcessingPolling(allItems);

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
      const processingDetail = fragment.querySelector(".processing-detail");
      const processingLabel = fragment.querySelector(".processing-label");
      const progressBar = fragment.querySelector(".progress-bar");
      const itemError = fragment.querySelector(".item-error");

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

      if (item.status === "PROCESSING") {
        uploadAction.hidden = true;
        processAction.hidden = true;
        processingDetail.hidden = false;
        const progress = Math.max(0, Math.min(100, item.processingProgress || 0));
        progressBar.style.width = `${progress}%`;
        processingLabel.textContent = `${stageName(item.processingStage)} · ${progress}%`;
      }

      if (["READY_TO_PROCESS", "FAILED", "MEDIA_READY"].includes(item.status)) {
        processAction.hidden = false;
        processAction.textContent =
          item.status === "FAILED"
            ? "Retry processing"
            : item.status === "MEDIA_READY"
              ? "Reprocess media"
              : "Process media";
      }

      if (item.errorMessage) {
        itemError.hidden = false;
        itemError.textContent = item.errorMessage;
      }

      mediaInput.disabled = item.status === "PROCESSING";
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

      inboxList.append(fragment);
    }
  } catch (error) {
    inboxList.innerHTML = `
      <div class="empty-card">
        <h3>Inbox could not be loaded</h3>
        <p>${error.message}</p>
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

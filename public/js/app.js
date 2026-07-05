import {
  createInbox,
  generateLesson,
  getLesson,
  getTranscript,
  listInbox,
  processMedia,
  transcribeMedia,
  updateTranscriptSegment,
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
    LESSON_GENERATING: "Generating lesson",
    LESSON_READY: "Lesson ready",
    LESSON_FAILED: "Lesson failed",
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
    STARTING: "Starting worker",
    LOAD_MODEL: "Loading Whisper model",
    UPLOAD_AUDIO: "Uploading audio",
    TRANSCRIBE: "Listening and transcribing",
    VALIDATE_TRANSCRIPT: "Checking timed transcript",
    SAVE_TRANSCRIPT: "Saving transcript",
    LOAD_LESSON_PROVIDER: "Loading lesson provider",
    ANALYZE_TRANSCRIPT: "Analyzing transcript",
    BUILD_SHADOWING: "Building shadowing chunks",
    BUILD_LESSON: "Building lesson",
    PREPARE_PROMPT: "Preparing lesson prompt",
    GENERATE_WITH_AI: "Generating lesson with AI",
    GENERATE_MOCK: "Generating test lesson",
    VALIDATE_LESSON: "Checking lesson contract",
    SAVE_LESSON: "Saving lesson",
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
    ["PROCESSING", "TRANSCRIBING", "LESSON_GENERATING"].includes(item.status)
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
  if (!["PROCESSING", "TRANSCRIBING", "LESSON_GENERATING"].includes(item.status)) {
    return;
  }

  detail.hidden = false;
  let progress = 0;
  let stage = "QUEUED";

  if (item.status === "PROCESSING") {
    progress = item.processingProgress || 0;
    stage = item.processingStage;
  } else if (item.status === "TRANSCRIBING") {
    progress = item.transcriptionProgress || 0;
    stage = item.transcriptionStage;
  } else {
    progress = item.lessonProgress || 0;
    stage = item.lessonStage;
  }

  progress = Math.max(0, Math.min(100, progress));
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
  div.textContent = value ?? "";
  return div.innerHTML;
}

async function loadTranscriptEditor(item, details, providerLabel, transcriptText) {
  try {
    const transcript = await getTranscript(item.id);
    details.hidden = false;
    providerLabel.textContent =
      `${transcript.provider} · ${transcript.model} · ${transcript.segments.length} segments · ${transcript.status}`;

    transcriptText.innerHTML = transcript.segments
      .map((segment) => {
        const effective = segment.reviewedText || segment.cleanedText || segment.rawText;
        return `
          <div class="transcript-segment" data-segment-id="${segment.id}">
            <span class="segment-time">${formatTime(segment.startMs)}</span>
            <div class="segment-editor">
              <textarea rows="2">${escapeHtml(effective)}</textarea>
              <div class="segment-actions">
                <span class="segment-origin">${segment.reviewStatus === "REVIEWED" ? "Reviewed" : "Cleaned from raw"}</span>
                <button class="segment-save" type="button">Save correction</button>
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    for (const row of transcriptText.querySelectorAll(".transcript-segment")) {
      const textarea = row.querySelector("textarea");
      const saveButton = row.querySelector(".segment-save");
      const origin = row.querySelector(".segment-origin");

      saveButton.addEventListener("click", async () => {
        saveButton.disabled = true;
        saveButton.textContent = "Saving…";
        try {
          await updateTranscriptSegment(item.id, row.dataset.segmentId, textarea.value);
          saveButton.textContent = "Saved";
          origin.textContent = "Reviewed";
          window.setTimeout(() => {
            saveButton.textContent = "Save correction";
            saveButton.disabled = false;
          }, 900);
        } catch (error) {
          window.alert(error.message);
          saveButton.textContent = "Save correction";
          saveButton.disabled = false;
        }
      });
    }
  } catch {
    details.hidden = true;
  }
}

async function loadLessonPreview(item, details, content) {
  try {
    const lesson = await getLesson(item.id);
    const meta = lesson.lesson || {};
    const learning = lesson.learning || {};

    details.hidden = false;
    content.innerHTML = `
      <div class="lesson-heading">
        <p class="lesson-meta">${escapeHtml(meta.provider)} · ${escapeHtml(meta.model)} · ${escapeHtml(meta.difficulty)}</p>
        <h3>${escapeHtml(meta.title)}</h3>
        <p>${escapeHtml(learning.summaryVi || "")}</p>
      </div>
      <div class="lesson-preview-grid">
        <section>
          <h4>Useful phrases</h4>
          ${learning.keyPhrases?.length
            ? learning.keyPhrases.map((item) => `
                <article class="learning-item">
                  <strong>${escapeHtml(item.phrase)}</strong>
                  <p>${escapeHtml(item.meaningVi)}</p>
                  <small>${escapeHtml(item.whyUseful)}</small>
                </article>
              `).join("")
            : "<p class=\"muted-copy\">No phrases generated in this provider mode.</p>"}
        </section>
        <section>
          <h4>Patterns</h4>
          ${learning.patterns?.length
            ? learning.patterns.map((item) => `
                <article class="learning-item">
                  <strong>${escapeHtml(item.pattern)}</strong>
                  <p>${escapeHtml(item.explanationVi)}</p>
                  <small>${escapeHtml(item.example)}</small>
                </article>
              `).join("")
            : "<p class=\"muted-copy\">No patterns generated yet.</p>"}
        </section>
      </div>
    `;
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
      const generateLessonAction = fragment.querySelector(".generate-lesson-action");
      const processingDetail = fragment.querySelector(".processing-detail");
      const processingLabel = fragment.querySelector(".processing-label");
      const progressBar = fragment.querySelector(".progress-bar");
      const itemError = fragment.querySelector(".item-error");
      const transcriptPreview = fragment.querySelector(".transcript-preview");
      const transcriptProvider = fragment.querySelector(".transcript-provider");
      const transcriptText = fragment.querySelector(".transcript-text");
      const lessonPreview = fragment.querySelector(".lesson-preview");
      const lessonContent = fragment.querySelector(".lesson-content");

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

      const active = ["PROCESSING", "TRANSCRIBING", "LESSON_GENERATING"].includes(item.status);
      if (active) {
        uploadAction.hidden = true;
        processAction.hidden = true;
        transcribeAction.hidden = true;
        generateLessonAction.hidden = true;
      }

      setProgress(item, processingDetail, processingLabel, progressBar);

      if (["READY_TO_PROCESS", "FAILED"].includes(item.status)) {
        processAction.hidden = false;
        processAction.textContent = item.status === "FAILED"
          ? "Retry media processing"
          : "Process media";
      }

      if ([
        "MEDIA_READY",
        "TRANSCRIPTION_FAILED",
        "TRANSCRIPT_READY",
        "LESSON_READY",
        "LESSON_FAILED"
      ].includes(item.status)) {
        transcribeAction.hidden = false;
        transcribeAction.textContent = ["TRANSCRIPT_READY", "LESSON_READY", "LESSON_FAILED"].includes(item.status)
          ? "Transcribe again"
          : item.status === "TRANSCRIPTION_FAILED"
            ? "Retry transcription"
            : "Create transcript";
      }

      if (["TRANSCRIPT_READY", "LESSON_READY", "LESSON_FAILED"].includes(item.status)) {
        generateLessonAction.hidden = false;
        generateLessonAction.textContent = item.status === "LESSON_READY"
          ? "Regenerate lesson"
          : item.status === "LESSON_FAILED"
            ? "Retry lesson generation"
            : "Generate lesson";
      }

      if (item.errorMessage) {
        itemError.hidden = false;
        itemError.textContent = item.errorMessage;
      }

      if (item.transcriptId && item.status !== "TRANSCRIBING") {
        void loadTranscriptEditor(
          item,
          transcriptPreview,
          transcriptProvider,
          transcriptText
        );
      }

      if (item.lessonId && item.status === "LESSON_READY") {
        void loadLessonPreview(item, lessonPreview, lessonContent);
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

      generateLessonAction.addEventListener("click", async () => {
        generateLessonAction.disabled = true;
        generateLessonAction.textContent = "Starting…";
        try {
          await generateLesson(item.id);
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

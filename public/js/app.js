import {
  createInbox,
  deleteInbox,
  generateLesson,
  getLesson,
  getTranscript,
  listInbox,
  listLessons,
  processMedia,
  startAutomaticAnalysis,
  transcribeMedia,
  updateTranscriptSegment,
  uploadMedia,
  listShareRegistry,
  listShareExports,
  deleteShareExport,
  restoreShareTombstone,
  createShareExport,
  getShareExportDownloadUrl,
  importShareZip,
  listExportableLessons
} from "./api.js";
import { createLessonPlayer } from "./lesson-player.js";

const pages = [...document.querySelectorAll(".page")];
const navLinks = [...document.querySelectorAll(".nav-link")];
const dialog = document.querySelector("#capture-dialog");
const captureForm = document.querySelector("#capture-form");
const captureError = document.querySelector("#capture-error");
const inboxList = document.querySelector("#inbox-list");
const inboxCount = document.querySelector("#inbox-count");
const inboxTemplate = document.querySelector("#inbox-card-template");
const statusFilters = [...document.querySelectorAll("[data-status-filter]")];
const todayLessons = document.querySelector("#today-lessons");
const libraryLessons = document.querySelector("#library-lessons");
const librarySearch = document.querySelector("#library-search");
const libraryStatusFilters = [...document.querySelectorAll("[data-library-status]")];
const lessonPlayerRoot = document.querySelector("#lesson-player-root");
const shareExportsList = document.querySelector("#share-exports-list");
const shareRegistryList = document.querySelector("#share-registry-list");
const shareRefreshExports = document.querySelector("#share-refresh-exports");
const shareStatusFilters = [...document.querySelectorAll("[data-share-status]")];
const shareLessonList = document.querySelector("#share-lesson-list");
const shareHideExported = document.querySelector("#share-hide-exported");
const shareSelectAll = document.querySelector("#share-select-all");
const shareDeselectAll = document.querySelector("#share-deselect-all");
const shareExportSelected = document.querySelector("#share-export-selected");
const shareImportInput = document.querySelector("#share-import-input");
const shareImportLabel = document.querySelector("#share-import-label");
const shareActionStatus = document.querySelector("#share-action-status");

let shareLessonData = [];
let shareSelectedIds = new Set();

let currentStatusFilter = "all";
let currentLibraryStatus = "";
let currentShareStatus = "";
let activePollTimer = null;
let librarySearchTimer = null;
let returnPageAfterLesson = "library";

const inboxStatusGroups = {
  all: null,
  active: new Set([
    "ACQUIRING_MEDIA",
    "READY_TO_PROCESS",
    "PROCESSING",
    "MEDIA_READY",
    "TRANSCRIBING",
    "TRANSCRIPT_READY",
    "LESSON_GENERATING"
  ]),
  ready: new Set(["LESSON_READY"]),
  attention: new Set([
    "MEDIA_ACQUISITION_FAILED",
    "WAITING_MEDIA",
    "TRANSCRIPTION_FAILED",
    "LESSON_FAILED",
    "FAILED"
  ])
};

const lessonPlayer = createLessonPlayer({
  root: lessonPlayerRoot,
  onClose: () => showPage(returnPageAfterLesson)
});

function showPage(pageName, { updateUrl = true } = {}) {
  if (pageName !== "lesson") lessonPlayer.reset();

  pages.forEach((page) => {
    page.hidden = page.id !== `${pageName}-page`;
  });

  navLinks.forEach((link) => {
    link.classList.toggle("is-active", link.dataset.page === pageName);
  });

  if (updateUrl && pageName !== "lesson") {
    const url = pageName === "today" ? "/" : `/?page=${encodeURIComponent(pageName)}`;
    window.history.replaceState({}, "", url);
  }

  if (pageName === "today") void refreshToday();
  if (pageName === "inbox") void refreshInbox();
  if (pageName === "library") void refreshLibrary();
  if (pageName === "share") void refreshShare();
}

async function openLesson(lessonId, returnPage = "library") {
  returnPageAfterLesson = returnPage;
  showPage("lesson");
  try {
    await lessonPlayer.open(lessonId);
  } catch (error) {
    lessonPlayerRoot.innerHTML = `
      <div class="empty-card">
        <h3>Lesson could not be opened</h3>
        <p>${escapeHtml(error.message)}</p>
        <button class="secondary-action" type="button" data-lesson-error-back>Back</button>
      </div>
    `;
    lessonPlayerRoot.querySelector("[data-lesson-error-back]")?.addEventListener("click", () => {
      showPage(returnPageAfterLesson);
    });
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
    WAITING_MEDIA: "Waiting for automatic import",
    ACQUIRING_MEDIA: "Importing media from URL",
    MEDIA_ACQUISITION_FAILED: "Automatic import failed",
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
    FETCH_SOURCE: "Opening source URL",
    DOWNLOAD_MEDIA: "Downloading media locally",
    FINALIZE_MEDIA: "Finalizing local media",
    REGISTER_MEDIA: "Registering media",
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
    ["ACQUIRING_MEDIA", "PROCESSING", "TRANSCRIBING", "LESSON_GENERATING"].includes(item.status)
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
  if (!["ACQUIRING_MEDIA", "PROCESSING", "TRANSCRIBING", "LESSON_GENERATING"].includes(item.status)) {
    return;
  }

  detail.hidden = false;
  let progress = 0;
  let stage = "QUEUED";

  if (item.status === "ACQUIRING_MEDIA") {
    progress = item.acquisitionProgress || 0;
    stage = item.acquisitionStage;
  } else if (item.status === "PROCESSING") {
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


function durationLabel(milliseconds) {
  if (!milliseconds) return "Short lesson";
  const seconds = Math.max(1, Math.round(milliseconds / 1000));
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}m ${rest}s` : `${minutes} min`;
}

function lessonCardMarkup(item) {
  const poster = item.media?.posterUrl
    ? `<img src="${escapeHtml(item.media.posterUrl)}" alt="" loading="lazy" />`
    : '<div class="lesson-card-poster-placeholder">EJ</div>';

  return `
    <article class="lesson-card" data-lesson-id="${escapeHtml(item.id)}">
      <button class="lesson-card-open" type="button" aria-label="Open ${escapeHtml(item.title)}">
        <div class="lesson-card-poster">${poster}</div>
        <div class="lesson-card-body">
          <div class="lesson-card-meta">
            <span>${escapeHtml(item.learningStatus || "NEW")}</span>
            <span>${escapeHtml(durationLabel(item.durationMs))}</span>
          </div>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.summaryVi || "A small moment ready for listening practice.")}</p>
          <div class="lesson-card-footer">
            <span>${escapeHtml(item.difficulty || "UNRATED")}</span>
            <span>${item.listenCount || 0} listens · ${item.shadowCount || 0} loops</span>
          </div>
        </div>
      </button>
    </article>
  `;
}

function bindLessonCards(container, returnPage) {
  for (const card of container.querySelectorAll("[data-lesson-id]")) {
    card.querySelector(".lesson-card-open")?.addEventListener("click", () => {
      void openLesson(card.dataset.lessonId, returnPage);
    });
  }
}

async function refreshToday() {
  if (!todayLessons) return;
  todayLessons.innerHTML = '<div class="empty-card"><p>Loading today…</p></div>';

  try {
    const newLessons = await listLessons({ status: "NEW", limit: 5 });
    const learningLessons = newLessons.length < 5
      ? await listLessons({ status: "LEARNING", limit: 5 - newLessons.length })
      : [];
    const lessons = [...newLessons, ...learningLessons];
    if (!lessons.length) {
      todayLessons.innerHTML = `
        <div class="empty-card">
          <span class="empty-icon">◎</span>
          <h3>Start with one meaningful video</h3>
          <p>Complete one item in Inbox and your next listening moment will appear here.</p>
        </div>
      `;
      return;
    }

    todayLessons.innerHTML = lessons.map(lessonCardMarkup).join("");
    bindLessonCards(todayLessons, "today");
  } catch (error) {
    todayLessons.innerHTML = `
      <div class="empty-card">
        <h3>Today could not be loaded</h3>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

async function refreshLibrary() {
  if (!libraryLessons) return;
  libraryLessons.innerHTML = '<div class="empty-card"><p>Searching your library…</p></div>';

  try {
    const lessons = await listLessons({
      q: librarySearch?.value || "",
      status: currentLibraryStatus,
      limit: 200
    });

    if (!lessons.length) {
      libraryLessons.innerHTML = `
        <div class="empty-card">
          <span class="empty-icon">◎</span>
          <h3>No lessons found</h3>
          <p>Try another search or complete a lesson from Inbox.</p>
        </div>
      `;
      return;
    }

    libraryLessons.innerHTML = lessons.map(lessonCardMarkup).join("");
    bindLessonCards(libraryLessons, "library");
  } catch (error) {
    libraryLessons.innerHTML = `
      <div class="empty-card">
        <h3>Library could not be loaded</h3>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
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

    const selectedStatuses = inboxStatusGroups[currentStatusFilter];
    const items = selectedStatuses
      ? allItems.filter((item) => selectedStatuses.has(item.status))
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
      const autoAction = fragment.querySelector(".auto-action");
      const processAction = fragment.querySelector(".process-action");
      const transcribeAction = fragment.querySelector(".transcribe-action");
      const generateLessonAction = fragment.querySelector(".generate-lesson-action");
      const openLessonAction = fragment.querySelector(".open-lesson-action");
      const deleteSourceAction = fragment.querySelector(".delete-source-action");
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

      const active = ["ACQUIRING_MEDIA", "PROCESSING", "TRANSCRIBING", "LESSON_GENERATING"].includes(item.status);
      if (active) {
        uploadAction.hidden = true;
        autoAction.hidden = true;
        processAction.hidden = true;
        transcribeAction.hidden = true;
        generateLessonAction.hidden = true;
        openLessonAction.hidden = true;
      }

      setProgress(item, processingDetail, processingLabel, progressBar);

      if ([
        "WAITING_MEDIA",
        "MEDIA_ACQUISITION_FAILED",
        "FAILED",
        "TRANSCRIPTION_FAILED",
        "LESSON_FAILED"
      ].includes(item.status)) {
        autoAction.hidden = false;
        autoAction.textContent = item.status === "WAITING_MEDIA"
          ? "Analyze URL automatically"
          : "Retry automatic analysis";
      }

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
        openLessonAction.hidden = false;
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

      autoAction.addEventListener("click", async () => {
        autoAction.disabled = true;
        autoAction.textContent = "Starting automatic analysis…";
        try {
          await startAutomaticAnalysis(item.id);
          await refreshInbox();
        } catch (error) {
          window.alert(error.message);
          await refreshInbox();
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

      openLessonAction.addEventListener("click", () => {
        if (item.lessonId) void openLesson(item.lessonId, "inbox");
      });

      deleteSourceAction.disabled = active;
      deleteSourceAction.addEventListener("click", async () => {
        const title = displayTitle(item);
        const confirmed = window.confirm(
          `Delete "${title}"?\n\nThis permanently removes the source and all local media, transcript, lesson, journal, and progress data linked to it.`
        );

        if (!confirmed) return;

        deleteSourceAction.disabled = true;
        deleteSourceAction.textContent = "Deleting…";

        try {
          await deleteInbox(item.id);
          await Promise.all([
            refreshInbox(),
            refreshToday(),
            refreshLibrary()
          ]);
        } catch (error) {
          window.alert(error.message);
          deleteSourceAction.disabled = false;
          deleteSourceAction.textContent = "Delete source";
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

for (const filter of libraryStatusFilters) {
  filter.addEventListener("click", async () => {
    currentLibraryStatus = filter.dataset.libraryStatus;
    libraryStatusFilters.forEach((item) => {
      item.classList.toggle("is-active", item === filter);
    });
    await refreshLibrary();
  });
}

librarySearch?.addEventListener("input", () => {
  if (librarySearchTimer) window.clearTimeout(librarySearchTimer);
  librarySearchTimer = window.setTimeout(() => {
    void refreshLibrary();
  }, 250);
});

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
    personalNote: formData.get("personalNote"),
    autoProcess: true
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

const initialPage = new URLSearchParams(window.location.search).get("page");
const supportedInitialPages = new Set(["today", "inbox", "library", "journal", "share"]);
showPage(supportedInitialPages.has(initialPage) ? initialPage : "today", { updateUrl: false });

function bytesLabel(value) {
  const units = ["B", "KB", "MB", "GB"];
  let size = Number(value || 0);
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

async function refreshShare() {
  await Promise.all([
    void refreshShareExports(),
    void refreshShareRegistry(),
    void refreshShareLessonList()
  ]);
}

async function refreshShareExports() {
  if (!shareExportsList) return;
  shareExportsList.innerHTML = '<div class="empty-card"><p>Loading exports…</p></div>';
  try {
    const entries = await listShareExports();
    if (!entries.length) {
      shareExportsList.innerHTML = `
        <article class="inbox-card">
          <div class="inbox-card-main">
            <p class="muted-copy">No exports yet. Click "Export all lessons" above.</p>
          </div>
        </article>
      `;
      return;
    }
    shareExportsList.innerHTML = entries.map((entry) => `
      <article class="inbox-card" data-share-export="${escapeHtml(entry.filename)}">
        <div class="inbox-card-main">
          <div class="inbox-meta">
            <span class="source-label">${escapeHtml(entry.filename)}</span>
            <span class="status-badge">${bytesLabel(entry.size)}</span>
          </div>
          <p class="source-note">Created ${escapeHtml(new Date(entry.createdAt).toLocaleString())}</p>
        </div>
        <div class="inbox-card-action">
          <a class="process-action" type="button" data-share-export-download href="${getShareExportDownloadUrl(entry.filename)}" download>Download .zip</a>
          <button class="delete-source-action" type="button" data-share-export-delete>Delete export</button>
        </div>
      </article>
    `).join("");

    for (const card of shareExportsList.querySelectorAll("[data-share-export]")) {
      const filename = card.dataset.shareExport;
      card.querySelector("[data-share-export-delete]")?.addEventListener("click", async () => {
        if (!window.confirm(`Delete ${filename}? This only removes the local zip.`)) return;
        try {
          await deleteShareExport(filename);
          await Promise.all([refreshShareExports(), refreshShareLessonList()]);
        } catch (error) {
          window.alert(error.message);
        }
      });
    }
  } catch (error) {
    shareExportsList.innerHTML = `
      <div class="empty-card">
        <h3>Exports could not be loaded</h3>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

async function refreshShareRegistry() {
  if (!shareRegistryList) return;
  shareRegistryList.innerHTML = '<div class="empty-card"><p>Loading registry…</p></div>';
  try {
    const entries = await listShareRegistry(currentShareStatus);
    if (!entries.length) {
      shareRegistryList.innerHTML = `
        <article class="inbox-card">
          <div class="inbox-card-main">
            <p class="muted-copy">
              No entries yet. This fills automatically when you export, import, or delete lessons.
            </p>
          </div>
        </article>
      `;
      return;
    }

    shareRegistryList.innerHTML = entries.map((entry) => {
      const statusLabel = entry.deleted
        ? '<span class="status-badge">Deleted</span>'
        : entry.inboxItemId
          ? '<span class="status-badge">Available</span>'
          : '<span class="status-badge">Missing</span>';
      const slug = entry.slug && entry.slug.length > 60
        ? `${entry.slug.slice(0, 60)}…`
        : entry.slug;
      return `
        <article class="inbox-card" data-share-slug="${escapeHtml(entry.slug)}">
          <div class="inbox-card-main">
            <div class="inbox-meta">
              <span class="source-label">${escapeHtml(entry.title || "Untitled")}</span>
              ${statusLabel}
            </div>
            <p class="source-note">${escapeHtml(entry.sourceUrl || "No source URL")}</p>
            <p class="source-note">Slug: <code>${escapeHtml(slug)}</code></p>
          </div>
          <div class="inbox-card-action">
            ${entry.deleted
              ? '<button class="auto-action" type="button" data-share-restore>Restore eligibility</button>'
              : '<span class="muted-copy">No action needed</span>'}
          </div>
        </article>
      `;
    }).join("");

    for (const card of shareRegistryList.querySelectorAll("[data-share-slug]")) {
      const slug = card.dataset.shareSlug;
      card.querySelector("[data-share-restore]")?.addEventListener("click", async () => {
        if (!window.confirm(`Allow "${slug}" to be imported again?`)) return;
        try {
          await restoreShareTombstone(slug);
          await refreshShareRegistry();
        } catch (error) {
          window.alert(error.message);
        }
      });
    }
  } catch (error) {
    shareRegistryList.innerHTML = `
      <div class="empty-card">
        <h3>Registry could not be loaded</h3>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

for (const filter of shareStatusFilters) {
  filter.addEventListener("click", async () => {
    currentShareStatus = filter.dataset.shareStatus;
    shareStatusFilters.forEach((item) => {
      item.classList.toggle("is-active", item === filter);
    });
    await refreshShareRegistry();
  });
}

shareRefreshExports?.addEventListener("click", () => {
  void refreshShareExports();
});

async function refreshShareLessonList() {
  if (!shareLessonList) return;
  shareLessonList.innerHTML = '<div class="empty-card"><p>Loading lessons…</p></div>';
  try {
    shareLessonData = await listExportableLessons();
    const hideExported = shareHideExported?.checked ?? true;

    const visible = hideExported
      ? shareLessonData.filter((l) => !l.alreadyExported)
      : shareLessonData;

    if (!shareLessonData.length) {
      shareLessonList.innerHTML = `
        <article class="inbox-card">
          <div class="inbox-card-main">
            <p class="muted-copy">No lessons ready. Generate a lesson first.</p>
          </div>
        </article>
      `;
      return;
    }

    if (hideExported && !visible.length) {
      shareLessonList.innerHTML = `
        <article class="inbox-card">
          <div class="inbox-card-main">
            <p class="muted-copy">All lessons already exported. Uncheck "Hide already exported" to re-export.</p>
          </div>
        </article>
      `;
    }

    shareSelectedIds = new Set(
      [...shareSelectedIds].filter((id) => visible.some((l) => l.lessonId === id))
    );

    shareLessonList.innerHTML = shareLessonData.map((lesson) => {
      const hiddenAttr = hideExported && lesson.alreadyExported ? " hidden" : "";
      return `
        <article class="inbox-card share-lesson-card"${hiddenAttr} data-share-lesson="${escapeHtml(lesson.lessonId)}">
          <div class="inbox-card-main">
            <label class="share-lesson-label">
              <input class="share-lesson-checkbox" type="checkbox"
                data-lesson-id="${escapeHtml(lesson.lessonId)}"
                ${shareSelectedIds.has(lesson.lessonId) ? "checked" : ""}
              />
              <div>
                <div class="inbox-meta">
                  <span class="source-label">${escapeHtml(lesson.title)}</span>
                  <span class="status-badge">${escapeHtml(durationLabel(lesson.durationMs))}</span>
                </div>
                <p class="source-note">${escapeHtml(lesson.sourceUrl || "No URL")}</p>
                ${lesson.alreadyExported
                  ? `<p class="muted-copy">Exported ${escapeHtml(new Date(lesson.lastExportedAt).toLocaleString())}</p>`
                  : ""}
              </div>
            </label>
          </div>
        </article>
      `;
    }).join("");

    for (const checkbox of shareLessonList.querySelectorAll(".share-lesson-checkbox")) {
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          shareSelectedIds.add(checkbox.dataset.lessonId);
        } else {
          shareSelectedIds.delete(checkbox.dataset.lessonId);
        }
        updateExportButton();
      });
    }

    updateExportButton();
  } catch (error) {
    shareLessonList.innerHTML = `
      <div class="empty-card">
        <h3>Lessons could not be loaded</h3>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

function updateExportButton() {
  if (!shareExportSelected) return;
  const count = shareSelectedIds.size;
  shareExportSelected.textContent = count ? `Export selected (${count})` : "Export selected (0)";
  shareExportSelected.disabled = count === 0;
}

shareHideExported?.addEventListener("change", () => {
  void refreshShareLessonList();
});

shareSelectAll?.addEventListener("click", () => {
  const hideExported = shareHideExported?.checked ?? true;
  for (const lesson of shareLessonData) {
    if (hideExported && lesson.alreadyExported) continue;
    shareSelectedIds.add(lesson.lessonId);
  }
  void refreshShareLessonList();
});

shareDeselectAll?.addEventListener("click", () => {
  shareSelectedIds.clear();
  void refreshShareLessonList();
});

shareExportSelected?.addEventListener("click", async () => {
  if (!shareSelectedIds.size) return;
  const ids = [...shareSelectedIds];
  shareExportSelected.disabled = true;
  shareExportSelected.textContent = "Exporting…";
  shareActionStatus.textContent = `Creating zip with ${ids.length} lesson(s)…`;
  try {
    await createShareExport({ lessonIds: ids });
    shareActionStatus.textContent = "Export complete.";
    shareSelectedIds.clear();
    await Promise.all([
      refreshShareLessonList(),
      refreshShareExports()
    ]);
  } catch (error) {
    shareActionStatus.textContent = error.message;
  } finally {
    shareExportSelected.disabled = false;
    updateExportButton();
    window.setTimeout(() => {
      shareActionStatus.textContent = "";
    }, 4000);
  }
});

shareImportInput?.addEventListener("change", async () => {
  const file = shareImportInput.files?.[0];
  if (!file) return;

  shareImportLabel.textContent = "Importing…";
  shareImportInput.disabled = true;
  shareActionStatus.textContent = "Processing zip…";
  try {
    const result = await importShareZip(file);
    shareActionStatus.textContent = `Done. Imported: ${result.results.filter((r) => r.status === "imported").length}, Skipped: ${result.results.filter((r) => r.status.startsWith("skipped") || r.status === "would-import").length}`;
    await Promise.all([
      refreshShareRegistry(),
      refreshShareExports(),
      refreshShareLessonList()
    ]);
  } catch (error) {
    shareActionStatus.textContent = error.message;
  } finally {
    shareImportInput.value = "";
    shareImportInput.disabled = false;
    shareImportLabel.textContent = "Import zip";
    window.setTimeout(() => {
      shareActionStatus.textContent = "";
    }, 6000);
  }
});

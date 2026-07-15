import {
  createInbox,
  deleteInbox,
  getTranscript,
  listLessons,
  listTags,
  startAutomaticAnalysis,
  updateTranscriptSegment,
  listShareRegistry,
  listShareExports,
  deleteShareExport,
  restoreShareTombstone,
  createShareExport,
  getShareExportDownloadUrl,
  importShareZip,
  listExportableLessons,
  listJournalEntries,
  getLessonDetail,
  getJournalOverview,
  updateLessonMetadata,
  updateLessonTags,
  updateLessonProgress
} from "./api.js";
import { createLessonPlayer } from "./lesson-player.js";
import { getUiSettings, updateUiSettings } from "./ui-settings.js";

const pages = [...document.querySelectorAll(".page")];
const navLinks = [...document.querySelectorAll(".nav-link")];
const dialog = document.querySelector("#capture-dialog");
const captureForm = document.querySelector("#capture-form");
const captureError = document.querySelector("#capture-error");
const libraryLessons = document.querySelector("#library-lessons");
const librarySearch = document.querySelector("#library-search");
const libraryStatusFilters = [...document.querySelectorAll("[data-library-status]")];
const libraryFavoriteFilters = [...document.querySelectorAll("[data-library-favorite]")];
const libraryTagList = document.querySelector("#library-tag-list");
const libraryTagsMore = document.querySelector("#library-tags-more");
const journalEntries = document.querySelector("#journal-entries");
const journalPhrases = document.querySelector("#journal-phrases");
const journalSearch = document.querySelector("#journal-search");
const journalHero = document.querySelector("#journal-hero");
const journalResultCount = document.querySelector("#journal-result-count");
const journalStatusFilters = [...document.querySelectorAll("[data-journal-status]")];
const journalFavoriteFilters = [...document.querySelectorAll("[data-journal-favorite]")];
const journalTagFilter = document.querySelector("#journal-tag-filter");
const journalSurprise = document.querySelector("#journal-surprise");
const journalPhraseOfDay = document.querySelector("#journal-phrase-of-day");
const journalPhraseOfDayText = document.querySelector("#journal-phrase-of-day-text");
const journalPhraseOfDayLink = document.querySelector("#journal-phrase-of-day-link");
const journalStatsBtn = document.querySelector("#journal-stats-btn");
const statsContent = document.querySelector("#stats-content");
const statsDialog = document.querySelector("#stats-dialog");
if (statsDialog) {
  statsDialog.addEventListener("click", (e) => {
    if (e.target === statsDialog) statsDialog.close();
  });
  for (const btn of document.querySelectorAll("[data-close-stats]")) {
    btn.addEventListener("click", () => statsDialog?.close());
  }
}
const lessonPlayerRoot = document.querySelector("#lesson-player-root");
const lessonDialog = document.querySelector("#lesson-dialog");
const lessonInfoDialog = document.querySelector("#lesson-info-dialog");
const lessonInfoRoot = document.querySelector("#lesson-info-root");
const shareExportsList = document.querySelector("#share-exports-list");
const shareRegistryList = document.querySelector("#share-registry-list");
const shareRefreshExports = document.querySelector("#share-refresh-exports");
const shareLessonList = document.querySelector("#share-lesson-list");
const shareHideExported = document.querySelector("#share-hide-exported");
const shareSelectAll = document.querySelector("#share-select-all");
const shareDeselectAll = document.querySelector("#share-deselect-all");
const shareExportSelected = document.querySelector("#share-export-selected");
const shareImportInput = document.querySelector("#share-import-input");
const shareImportLabel = document.querySelector("#share-import-label");
const shareActionStatus = document.querySelector("#share-action-status");
const shareSelectionSummary = document.querySelector("#share-selection-summary");
const metadataDialog = document.querySelector("#lesson-metadata-dialog");
const metadataForm = document.querySelector("#lesson-metadata-form");
const metadataError = document.querySelector("#metadata-error");
const metadataPromptButton = document.querySelector("#metadata-prompt-button");
const metadataExistingTags = document.querySelector("#metadata-existing-tags");

let shareLessonData = [];
let shareSelectedIds = new Set();
const supportedPages = new Set(["journal", "library", "share"]);
const supportedLearningStatuses = new Set(["", "NEW", "LEARNING", "MASTERED"]);
const restoredUiSettings = getUiSettings();
let currentPage = supportedPages.has(restoredUiSettings.activePage)
  ? restoredUiSettings.activePage
  : "journal";
let currentLibraryStatus = restoredUiSettings.library?.status || "";
let currentLibraryFavorite = Boolean(restoredUiSettings.library?.favorite);
let currentLibraryTag = restoredUiSettings.library?.tag || "";
let libraryTagsExpanded = Boolean(restoredUiSettings.library?.tagsExpanded);
let currentJournalStatus = supportedLearningStatuses.has(restoredUiSettings.journal?.status)
  ? restoredUiSettings.journal.status
  : "";
let currentJournalFavorite = Boolean(restoredUiSettings.journal?.favorite);
let currentJournalTag = restoredUiSettings.journal?.tag || "";
let journalOverviewCache = null;
let journalEntryCache = [];
let availableTags = [];
let librarySearchTimer = null;
let libraryLessonMap = new Map();
let metadataEditingLesson = null;

if (journalSearch) journalSearch.value = restoredUiSettings.journal?.search || "";
if (librarySearch) librarySearch.value = restoredUiSettings.library?.search || "";

function syncJournalFilters() {
  journalStatusFilters.forEach((item) => {
    item.classList.toggle(
      "is-active",
      !currentJournalFavorite && item.dataset.journalStatus === currentJournalStatus
    );
  });
  journalFavoriteFilters.forEach((item) => {
    item.classList.toggle("is-active", currentJournalFavorite);
  });
  if (journalTagFilter) journalTagFilter.value = currentJournalTag;
}

function syncLibraryFilters() {
  libraryStatusFilters.forEach((item) => {
    item.classList.toggle(
      "is-active",
      !currentLibraryFavorite && item.dataset.libraryStatus === currentLibraryStatus
    );
  });
  libraryFavoriteFilters.forEach((item) => {
    item.classList.toggle("is-active", currentLibraryFavorite);
    item.textContent = currentLibraryFavorite ? "♥" : "♡";
  });
}

syncJournalFilters();
syncLibraryFilters();

const lessonPlayer = createLessonPlayer({
  root: lessonPlayerRoot,
  onClose: () => lessonDialog?.close(),
  onStateChange: (playerState) => {
    const savedLesson = getUiSettings().lesson;
    if (!savedLesson || savedLesson.id !== playerState.lessonId) return;
    updateUiSettings({
      lesson: {
        ...savedLesson,
        player: playerState
      }
    });
  }
});

function closeLessonDialog() {
  lessonDialog?.close();
}

if (lessonDialog) {
  lessonDialog.addEventListener("click", (event) => {
    if (event.target === lessonDialog) closeLessonDialog();
  });
  lessonDialog.addEventListener("close", () => {
    lessonPlayer.reset();
    if (lessonPlayerRoot) lessonPlayerRoot.innerHTML = "";
    updateUiSettings({ lesson: null });
  });
  document.querySelector("[data-close-lesson]")?.addEventListener("click", closeLessonDialog);
}

function closeLessonInfoDialog() {
  lessonInfoDialog?.close();
}

if (lessonInfoDialog) {
  lessonInfoDialog.addEventListener("click", (event) => {
    if (event.target === lessonInfoDialog) closeLessonInfoDialog();
  });
  lessonInfoDialog.addEventListener("close", () => {
    if (lessonInfoRoot) lessonInfoRoot.innerHTML = "";
  });
  document.querySelector("[data-close-lesson-info]")?.addEventListener("click", closeLessonInfoDialog);
}

function saveCurrentScroll() {
  if (!supportedPages.has(currentPage)) return;
  updateUiSettings({
    scrollByPage: {
      [currentPage]: Math.max(0, Math.round(window.scrollY))
    }
  });
}

async function showPage(pageName, { updateUrl = true, restoreScroll = true } = {}) {
  if (!supportedPages.has(pageName)) pageName = "journal";
  if (currentPage !== pageName) saveCurrentScroll();
  if (lessonDialog?.open) lessonDialog.close();
  if (lessonInfoDialog?.open) lessonInfoDialog.close();
  lessonPlayer.reset();
  currentPage = pageName;
  updateUiSettings({ activePage: pageName });

  pages.forEach((page) => {
    page.hidden = page.id !== `${pageName}-page`;
  });

  navLinks.forEach((link) => {
    link.classList.toggle("is-active", link.dataset.page === pageName);
  });

  if (updateUrl && pageName !== "lesson") {
    const url = pageName === "journal" ? "/" : `/?page=${encodeURIComponent(pageName)}`;
    window.history.replaceState({}, "", url);
  }

  if (pageName === "journal") await refreshJournal();
  if (pageName === "library") await refreshLibrary();
  if (pageName === "share") await refreshShare();

  if (restoreScroll) {
    const savedTop = Number(getUiSettings().scrollByPage?.[pageName] || 0);
    window.requestAnimationFrame(() => window.scrollTo({ top: savedTop, behavior: "auto" }));
  }
}

async function openLesson(lessonId, returnPage = "library", playerState = null) {
  updateUiSettings({
    activePage: returnPage,
    lesson: {
      id: lessonId,
      returnPage,
      player: playerState || {}
    }
  });
  if (!lessonDialog?.open) lessonDialog?.showModal();
  try {
    await lessonPlayer.open(lessonId, playerState || {});
  } catch (error) {
    updateUiSettings({ lesson: null });
    lessonPlayerRoot.innerHTML = `
      <div class="empty-card">
        <h3>Lesson could not be opened</h3>
        <p>${escapeHtml(error.message)}</p>
        <button class="secondary-action" type="button" data-lesson-error-back>Close</button>
      </div>
    `;
    lessonPlayerRoot.querySelector("[data-lesson-error-back]")?.addEventListener("click", () => {
      lessonDialog?.close();
    });
  }
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

function durationLabel(milliseconds) {
  if (!milliseconds) return "Short lesson";
  const seconds = Math.max(1, Math.round(milliseconds / 1000));
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}m ${rest}s` : `${minutes} min`;
}

function formatJournalDate(value) {
  if (!value) return "recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recently";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric"
  }).format(date);
}

function durationTone(milliseconds) {
  const seconds = Math.round(Number(milliseconds || 0) / 1000);
  if (seconds < 60) return "short";
  if (seconds < 180) return "medium";
  return "long";
}

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

function readingStatusLabel(status) {
  return {
    NEW: "New",
    LEARNING: "Reading",
    MASTERED: "Read"
  }[status] || status || "New";
}

function readingStatus(item = {}) {
  if (Number(item.viewCount || 0) < 5) return "NEW";
  return item.learningStatus || "NEW";
}

function readingStatusBadgeMarkup(status) {
  const normalizedStatus = status || "NEW";
  return `
    <span class="reading-status reading-status-${escapeHtml(normalizedStatus.toLowerCase())}">
      ${escapeHtml(readingStatusLabel(normalizedStatus))}
    </span>
  `;
}

function tagChipsMarkup(tags = [], { limit = 3 } = {}) {
  const visible = tags.slice(0, limit);
  if (!visible.length) return "";
  const remaining = Math.max(0, tags.length - visible.length);
  return `
    <div class="lesson-tag-row">
      ${visible.map((tag) => `<span class="lesson-tag">#${escapeHtml(tag.name)}</span>`).join("")}
      ${remaining ? `<span class="lesson-tag lesson-tag-more">+${remaining}</span>` : ""}
    </div>
  `;
}

function tagNameKey(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

function lessonTagEditorMarkup(tags = []) {
  const listId = "lesson-tag-suggestions";
  return `
    <div class="lesson-tag-editor" data-lesson-tag-editor>
      <div class="lesson-tag-row lesson-info-tag-row">
        ${tags.map((tag) => `
          <span class="lesson-tag lesson-tag-editable">
            #${escapeHtml(tag.name)}
            <button
              class="lesson-tag-remove"
              type="button"
              title="Remove tag"
              aria-label="Remove ${escapeHtml(tag.name)}"
              data-remove-lesson-tag="${escapeHtml(tag.name)}"
            >×</button>
          </span>
        `).join("")}
        <button class="lesson-tag-add" type="button" title="Add topic tag" aria-label="Add topic tag" data-add-lesson-tag>+</button>
      </div>
      <form class="lesson-tag-add-form" data-lesson-tag-form hidden>
        <input
          type="text"
          name="tagName"
          list="${listId}"
          placeholder="New or existing topic"
          autocomplete="off"
        />
        <datalist id="${listId}">
          ${availableTags.map((tag) => `<option value="${escapeHtml(tag.name)}"></option>`).join("")}
        </datalist>
        <button class="primary-action" type="submit">Add</button>
      </form>
      <p class="lesson-tag-editor-error" data-lesson-tag-error hidden></p>
    </div>
  `;
}

function libraryIconSvg(name) {
  const icons = {
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.4 5.4 0 0 0-7.7 0L12 5.7l-1.1-1.1a5.4 5.4 0 0 0-7.7 7.7L12 21l8.8-8.7a5.4 5.4 0 0 0 0-7.7Z"></path></svg>',
    preview: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>'
  };
  return icons[name] || "";
}

function durationBadgeMarkup(milliseconds) {
  return `
    <span class="lesson-duration-badge lesson-duration-${durationTone(milliseconds)}">
      ${escapeHtml(durationLabel(milliseconds))}
    </span>
  `;
}

function lessonNotesBadgeMarkup(count = 0) {
  const noteCount = Number(count || 0);
  return `
    <span class="lesson-note-count${noteCount ? "" : " is-empty"}" title="${noteCount} note${noteCount === 1 ? "" : "s"}">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21 12a8 8 0 0 1-8 8H7l-4 3v-5.2A8 8 0 1 1 21 12Z"></path>
      </svg>
      <span>${noteCount}</span>
    </span>
  `;
}

function lessonCardMarkup(item) {
  const status = readingStatus(item);
  const poster = item.media?.posterUrl
    ? `<img src="${escapeHtml(item.media.posterUrl)}" alt="" loading="lazy" />`
    : '<div class="lesson-card-poster-placeholder">EJ</div>';

  return `
    <article class="lesson-card" data-lesson-id="${escapeHtml(item.id)}" data-inbox-id="${escapeHtml(item.inboxItemId || "")}">
      <button class="lesson-card-delete" type="button" title="Delete lesson" data-lesson-delete>×</button>
      <button
        class="lesson-card-preview"
        type="button"
        title="Preview lesson"
        aria-label="Preview lesson"
        data-lesson-preview
      >${libraryIconSvg("preview")}</button>
      <button
        class="lesson-card-favorite${item.isFavorite ? " is-active" : ""}"
        type="button"
        title="${item.isFavorite ? "Remove favorite" : "Add favorite"}"
        aria-label="${item.isFavorite ? "Remove favorite" : "Add favorite"}"
        aria-pressed="${item.isFavorite ? "true" : "false"}"
        data-lesson-favorite
      >${libraryIconSvg("heart")}</button>
      <button class="lesson-card-open" type="button" aria-label="Open ${escapeHtml(item.title)}">
        <div class="lesson-card-poster">${poster}</div>
        <div class="lesson-card-body">
          <div class="lesson-card-heading">
            <div class="lesson-card-meta">
              ${durationBadgeMarkup(item.durationMs)}
              ${readingStatusBadgeMarkup(status)}
            </div>
            <div class="lesson-card-title-wrap">
              <h3>${escapeHtml(item.title)}</h3>
              ${tagChipsMarkup(item.tags)}
            </div>
          </div>
          <p>${escapeHtml(item.summaryVi || "A small moment ready for listening practice.")}</p>
          <div class="lesson-card-footer">
            <span>${escapeHtml(item.difficulty || "UNRATED")}</span>
            <span>${item.viewCount || 0} views</span>
          </div>
        </div>
      </button>
      <div class="lesson-card-actions">
        ${item.sourceUrl ? `<a class="source-link" href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noreferrer">Open source</a>` : ""}
        <button class="secondary-action metadata-action" type="button" data-lesson-metadata>Update lesson</button>
        <button class="secondary-action regenerate-action" type="button" data-lesson-regenerate>Regenerate lesson</button>
        ${lessonNotesBadgeMarkup(item.noteCount)}
      </div>
    </article>
  `;
}

async function renderTranscriptEditor(inboxId, content) {
  if (!inboxId || !content) return;
  content.innerHTML = "<p class=\"muted-copy\">Loading transcript…</p>";
  try {
    const transcript = await getTranscript(inboxId);
    const originalText = new Map();
    const segmentRows = transcript.segments.map((segment) => {
      const effective = segment.reviewedText || segment.cleanedText || segment.rawText;
      originalText.set(segment.id, effective);
      return `
        <div class="transcript-segment" data-segment-id="${segment.id}">
          <span class="segment-time">${formatTime(segment.startMs)}</span>
          <div class="segment-editor">
            <textarea rows="2">${escapeHtml(effective)}</textarea>
            <span class="segment-origin">${segment.reviewStatus === "REVIEWED" ? "Reviewed" : "Cleaned"}</span>
          </div>
        </div>
      `;
    }).join("");

    content.innerHTML = `
      <div class="transcript-editor-list">${segmentRows}</div>
      <div class="transcript-review-footer">
        <span class="muted-copy" data-transcript-update-status>Review any sentence, then save all changes once.</span>
        <button class="primary-action" type="button" data-transcript-update>Update transcript</button>
      </div>
    `;

    const updateButton = content.querySelector("[data-transcript-update]");
    const updateStatus = content.querySelector("[data-transcript-update-status]");
    updateButton?.addEventListener("click", async () => {
      const changedRows = [...content.querySelectorAll(".transcript-segment")].filter((row) => {
        const value = row.querySelector("textarea")?.value || "";
        return value.trim() !== String(originalText.get(row.dataset.segmentId) || "").trim();
      });

      if (!changedRows.length) {
        updateStatus.textContent = "No transcript changes to save.";
        return;
      }

      updateButton.disabled = true;
      updateButton.textContent = "Updating…";
      updateStatus.textContent = `Saving ${changedRows.length} changed sentence(s)…`;
      try {
        await Promise.all(changedRows.map((row) => {
          const value = row.querySelector("textarea")?.value || "";
          return updateTranscriptSegment(inboxId, row.dataset.segmentId, value);
        }));
        changedRows.forEach((row) => {
          const value = row.querySelector("textarea")?.value || "";
          originalText.set(row.dataset.segmentId, value);
          row.querySelector(".segment-origin").textContent = "Reviewed";
        });
        updateStatus.textContent = `${changedRows.length} sentence(s) updated.`;
      } catch (error) {
        updateStatus.textContent = error.message;
      } finally {
        updateButton.disabled = false;
        updateButton.textContent = "Update transcript";
      }
    });
  } catch {
    content.innerHTML = "<p class=\"muted-copy\">Transcript not found. Generate a lesson first.</p>";
  }
}

function lessonInfoMarkup(item) {
  const status = readingStatus(item);
  const poster = item.media?.posterUrl
    ? `<img src="${escapeHtml(item.media.posterUrl)}" alt="" />`
    : '<div class="lesson-card-poster-placeholder">EJ</div>';

  return `
    <section class="lesson-info-view" data-lesson-id="${escapeHtml(item.id)}" data-inbox-id="${escapeHtml(item.inboxItemId || "")}">
      <div class="lesson-info-card">
        <div class="lesson-info-media">${poster}</div>
        <div class="lesson-info-body">
          <div class="lesson-card-heading lesson-info-heading">
            <div class="lesson-card-meta">
              ${durationBadgeMarkup(item.durationMs)}
              ${readingStatusBadgeMarkup(status)}
            </div>
            <div class="lesson-info-top-actions">
              ${item.sourceUrl ? `<a class="source-link" href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noreferrer">Open source</a>` : ""}
              <button class="secondary-action metadata-action" type="button" data-info-metadata>Update lesson</button>
              <button class="secondary-action regenerate-action" type="button" data-info-regenerate>Regenerate lesson</button>
              <button
                class="lesson-card-preview"
                type="button"
                title="Preview lesson"
                aria-label="Preview lesson"
                data-info-preview
              >${libraryIconSvg("preview")}</button>
              <button
                class="lesson-card-favorite${item.isFavorite ? " is-active" : ""}"
                type="button"
                title="${item.isFavorite ? "Remove favorite" : "Add favorite"}"
                aria-label="${item.isFavorite ? "Remove favorite" : "Add favorite"}"
                aria-pressed="${item.isFavorite ? "true" : "false"}"
                data-info-favorite
              >${libraryIconSvg("heart")}</button>
              <button class="lesson-dialog-close lesson-info-close" type="button" data-close-lesson-info aria-label="Close lesson information">×</button>
            </div>
            <div class="lesson-card-title-wrap lesson-info-title-wrap">
              <h2>${escapeHtml(item.title)}</h2>
              ${lessonTagEditorMarkup(item.tags || [])}
            </div>
          </div>
          <p>${escapeHtml(item.summaryVi || "A small moment ready for listening practice.")}</p>
          <div class="lesson-info-stats">
            <span>${escapeHtml(item.difficulty || "UNRATED")}</span>
            <span>${item.viewCount || 0} views</span>
            <span>${Number(item.noteCount || 0)} notes</span>
          </div>
        </div>
      </div>

      <details class="lesson-transcript-preview lesson-info-transcript" open>
        <summary>Review transcript</summary>
        <div class="lesson-transcript-content" data-info-transcript></div>
      </details>
    </section>
  `;
}

function updateLessonTagsInLibraryCard(lessonId, tags) {
  const titleWrap = libraryLessons?.querySelector(`[data-lesson-id="${CSS.escape(lessonId)}"] .lesson-card-title-wrap`);
  if (!titleWrap) return;
  const oldRow = titleWrap.querySelector(".lesson-tag-row");
  const nextMarkup = tagChipsMarkup(tags);
  if (oldRow) oldRow.remove();
  if (nextMarkup) titleWrap.insertAdjacentHTML("beforeend", nextMarkup);
}

async function persistLessonInfoTags(lessonId, item, tagNames) {
  const result = await updateLessonTags(lessonId, tagNames);
  item.tags = result.tags || [];
  libraryLessonMap.set(lessonId, item);
  updateLessonTagsInLibraryCard(lessonId, item.tags);
  availableTags = await listTags();
  renderLibraryTags(availableTags);
  renderJournalTagOptions(availableTags);
  const editor = lessonInfoRoot.querySelector("[data-lesson-tag-editor]");
  if (editor) {
    editor.outerHTML = lessonTagEditorMarkup(item.tags);
    bindLessonInfoTagEditor(lessonId, item);
  }
  return item.tags;
}

function bindLessonInfoTagEditor(lessonId, item) {
  const editor = lessonInfoRoot.querySelector("[data-lesson-tag-editor]");
  if (!editor) return;
  const form = editor.querySelector("[data-lesson-tag-form]");
  const input = form?.elements.tagName;
  const error = editor.querySelector("[data-lesson-tag-error]");

  const setError = (message = "") => {
    if (!error) return;
    error.textContent = message;
    error.hidden = !message;
  };

  editor.querySelector("[data-add-lesson-tag]")?.addEventListener("click", () => {
    setError("");
    if (!form) return;
    form.hidden = !form.hidden;
    if (!form.hidden) input?.focus();
  });

  for (const button of editor.querySelectorAll("[data-remove-lesson-tag]")) {
    button.addEventListener("click", async () => {
      const tagName = button.dataset.removeLessonTag || "";
      const nextTags = (item.tags || [])
        .map((tag) => tag.name)
        .filter((name) => tagNameKey(name) !== tagNameKey(tagName));
      button.disabled = true;
      setError("");
      try {
        await persistLessonInfoTags(lessonId, item, nextTags);
      } catch (errorMessage) {
        button.disabled = false;
        setError(errorMessage.message);
      }
    });
  }

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = String(input?.value || "").trim();
    if (!name) {
      setError("Enter a topic tag.");
      return;
    }
    const existingNames = (item.tags || []).map((tag) => tag.name);
    if (existingNames.some((existing) => tagNameKey(existing) === tagNameKey(name))) {
      setError("This lesson already has that tag.");
      input?.select();
      return;
    }
    const submit = form.querySelector("button[type='submit']");
    submit.disabled = true;
    setError("");
    try {
      await persistLessonInfoTags(lessonId, item, [...existingNames, name]);
    } catch (errorMessage) {
      submit.disabled = false;
      setError(errorMessage.message);
    }
  });
}

async function openLessonInfo(lessonId) {
  const item = libraryLessonMap.get(lessonId);
  if (!item || !lessonInfoDialog || !lessonInfoRoot) return;

  if (!availableTags.length) {
    availableTags = await listTags();
  }
  lessonInfoRoot.innerHTML = lessonInfoMarkup(item);
  if (!lessonInfoDialog.open) lessonInfoDialog.showModal();
  bindLessonInfoTagEditor(lessonId, item);

  lessonInfoRoot.querySelector("[data-info-preview]")?.addEventListener("click", () => {
    void openLesson(lessonId, "library");
  });

  lessonInfoRoot.querySelector("[data-close-lesson-info]")?.addEventListener("click", closeLessonInfoDialog);

  lessonInfoRoot.querySelector("[data-info-metadata]")?.addEventListener("click", () => {
    lessonInfoDialog.close();
    void openMetadataDialog(lessonId);
  });

  lessonInfoRoot.querySelector("[data-info-favorite]")?.addEventListener("click", async (event) => {
    const btn = event.currentTarget;
    btn.disabled = true;
    try {
      const progress = await updateLessonProgress(lessonId, "TOGGLE_FAVORITE");
      item.isFavorite = Boolean(progress.isFavorite);
      libraryLessonMap.set(lessonId, item);
      btn.classList.toggle("is-active", item.isFavorite);
      btn.setAttribute("aria-pressed", String(item.isFavorite));
      btn.title = item.isFavorite ? "Remove favorite" : "Add favorite";
      btn.setAttribute("aria-label", item.isFavorite ? "Remove favorite" : "Add favorite");
      const cardButton = libraryLessons?.querySelector(`[data-lesson-id="${CSS.escape(lessonId)}"] [data-lesson-favorite]`);
      if (cardButton) {
        cardButton.classList.toggle("is-active", item.isFavorite);
        cardButton.setAttribute("aria-pressed", String(item.isFavorite));
        cardButton.title = item.isFavorite ? "Remove favorite" : "Add favorite";
        cardButton.setAttribute("aria-label", item.isFavorite ? "Remove favorite" : "Add favorite");
      }
    } catch (error) {
      window.alert(error.message);
    } finally {
      btn.disabled = false;
    }
  });

  lessonInfoRoot.querySelector("[data-info-regenerate]")?.addEventListener("click", async (event) => {
    const btn = event.currentTarget;
    if (!item.inboxItemId) return;
    btn.disabled = true;
    btn.textContent = "Regenerating…";
    try {
      await startAutomaticAnalysis(item.inboxItemId);
      window.setTimeout(() => refreshLibrary(), 2000);
    } catch (error) {
      window.alert(error.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "Regenerate lesson";
    }
  });

  await renderTranscriptEditor(item.inboxItemId, lessonInfoRoot.querySelector("[data-info-transcript]"));
}

function bindLibraryCards(container) {
  for (const card of container.querySelectorAll("[data-lesson-id]")) {
    card.querySelector(".lesson-card-open")?.addEventListener("click", () => {
      void openLessonInfo(card.dataset.lessonId);
    });

    card.querySelector("[data-lesson-preview]")?.addEventListener("click", (event) => {
      event.stopPropagation();
      void openLesson(card.dataset.lessonId, "library");
    });

    card.querySelector("[data-lesson-delete]")?.addEventListener("click", async (event) => {
      event.stopPropagation();
      const title = card.querySelector("h3")?.textContent || "this lesson";
      const inboxId = card.dataset.inboxId;
      if (!inboxId) return;
      if (!window.confirm(`Delete "${title}"?\n\nThis permanently removes the lesson, media, transcript, and all linked data.`)) return;
      const btn = card.querySelector("[data-lesson-delete]");
      btn.disabled = true;
      try {
        await deleteInbox(inboxId);
        await refreshLibrary();
      } catch (error) {
        window.alert(error.message);
        btn.disabled = false;
      }
    });

    card.querySelector("[data-lesson-favorite]")?.addEventListener("click", async (event) => {
      event.stopPropagation();
      const btn = event.currentTarget;
      btn.disabled = true;
      try {
        const progress = await updateLessonProgress(card.dataset.lessonId, "TOGGLE_FAVORITE");
        const isFavorite = Boolean(progress.isFavorite);
        btn.classList.toggle("is-active", isFavorite);
        btn.setAttribute("aria-pressed", String(isFavorite));
        btn.title = isFavorite ? "Remove favorite" : "Add favorite";
        btn.setAttribute("aria-label", isFavorite ? "Remove favorite" : "Add favorite");
        btn.innerHTML = libraryIconSvg("heart");
        if (currentLibraryFavorite && !isFavorite) {
          await refreshLibrary();
        }
      } catch (error) {
        window.alert(error.message);
      } finally {
        btn.disabled = false;
      }
    });

    card.querySelector("[data-lesson-regenerate]")?.addEventListener("click", async (event) => {
      event.stopPropagation();
      const inboxId = card.dataset.inboxId;
      if (!inboxId) return;
      const btn = card.querySelector("[data-lesson-regenerate]");
      btn.disabled = true;
      btn.textContent = "Regenerating…";
      try {
        await startAutomaticAnalysis(inboxId);
        window.setTimeout(() => refreshLibrary(), 2000);
      } catch (error) {
        window.alert(error.message);
      } finally {
        btn.disabled = false;
        btn.textContent = "Regenerate lesson";
      }
    });

    card.querySelector("[data-lesson-metadata]")?.addEventListener("click", (event) => {
      event.stopPropagation();
      void openMetadataDialog(card.dataset.lessonId);
    });
  }
}

function transcriptText(lessonDetail) {
  return (lessonDetail.transcript?.segments || [])
    .map((segment) => {
      const text = segment.reviewedText || segment.cleanedText || segment.rawText || "";
      return `[${formatTime(segment.startMs)}] ${text}`;
    })
    .filter(Boolean)
    .join("\n");
}

function buildMetadataPrompt(lessonDetail) {
  const title = lessonDetail.lesson?.title || "";
  const summary = lessonDetail.learning?.summaryVi || "";
  const script = transcriptText(lessonDetail);
  const currentTags = (lessonDetail.tags || []).map((tag) => tag.name);
  const existingTags = availableTags.map((tag) => tag.name);

  return `You are helping update metadata for a personal English listening lesson.

Goal:
- Create a concise, specific title.
- Create a useful description/content summary for the learner.
- Select 1-4 concise content tags.
- Reuse an existing tag when it fits; create a new tag only when none is suitable.
- Base the result only on the transcript.
- Avoid generic titles such as "Facebook", "Facebook Reel", "Personal learning", or "Lesson".

Current metadata:
Title: ${title}
Description: ${summary}
Current tags: ${currentTags.join(", ") || "(none)"}
Existing tag library: ${existingTags.join(", ") || "(none yet)"}

Transcript:
${script || "(No transcript available)"}

Return ONLY valid JSON with this exact structure:
{
  "title": "A specific lesson title, max 90 characters",
  "content": "A learner-facing description in Vietnamese, 1-3 sentences, max 500 characters",
  "tags": ["1 to 4 concise tags"]
}

Rules:
- Do not include markdown fences.
- Return exactly title, content, and tags.
- Tags should describe the subject or learning context, not generic words such as video or lesson.
- Use natural Vietnamese for "content".
- The title may be English if the key phrase is English; otherwise use Vietnamese.`;
}

async function copyText(value) {
  if (navigator.clipboard) {
    const copied = await navigator.clipboard.writeText(value).then(() => true).catch(() => false);
    if (copied) return true;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  return copied;
}

function parseMetadataResponse(value) {
  const trimmed = String(value || "").trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(trimmed);
}

function lessonPreviewEl() {
  let el = document.querySelector("#lesson-hover-preview");
  if (!el) {
    el = document.createElement("div");
    el.id = "lesson-hover-preview";
    el.className = "lesson-hover-preview";
    document.body.append(el);
  }
  return el;
}

function positionLessonPreview(event) {
  const el = document.querySelector("#lesson-hover-preview");
  if (!el || el.hidden) return;
  const pad = 14;
  const width = el.offsetWidth || 280;
  const height = el.offsetHeight || 140;
  const x = Math.min(window.innerWidth - width - pad, event.clientX + 16);
  const y = Math.min(window.innerHeight - height - pad, event.clientY + 16);
  el.style.left = `${Math.max(pad, x)}px`;
  el.style.top = `${Math.max(pad, y)}px`;
}

function showLessonPreview(event) {
  const target = event.currentTarget;
  const el = lessonPreviewEl();
  el.hidden = false;
  const poster = target.dataset.previewPoster
    ? `<img src="${escapeHtml(target.dataset.previewPoster)}" alt="" />`
    : '<div class="lesson-hover-preview-placeholder">EJ</div>';
  el.innerHTML = `
    <div class="lesson-hover-preview-media">${poster}</div>
    <div class="lesson-hover-preview-body">
      <div class="lesson-card-meta">
        ${readingStatusBadgeMarkup(target.dataset.previewReadingStatus || "NEW")}
        <span>${escapeHtml(target.dataset.previewViews || "0")} views</span>
      </div>
      <strong>${escapeHtml(target.dataset.previewTitle || "Lesson")}</strong>
      <p>${escapeHtml(target.dataset.previewSummary || "No description yet.")}</p>
    </div>
  `;
  positionLessonPreview(event);
}

function hideLessonPreview() {
  const el = document.querySelector("#lesson-hover-preview");
  if (el) el.hidden = true;
}

async function openMetadataDialog(lessonId) {
  if (!metadataDialog || !metadataForm) return;
  metadataError.hidden = true;
  metadataError.textContent = "";
  metadataForm.reset();
  metadataDialog.showModal();

  try {
    const [lessonDetail, tags] = await Promise.all([getLessonDetail(lessonId), listTags()]);
    metadataEditingLesson = lessonDetail;
    availableTags = tags;
    if (metadataExistingTags) {
      metadataExistingTags.innerHTML = tags.length
        ? tags.map((tag) => `<span class="lesson-tag">#${escapeHtml(tag.name)}</span>`).join("")
        : '<span class="muted-copy">No tags yet. The first useful tags will be created here.</span>';
    }
  } catch (error) {
    metadataError.hidden = false;
    metadataError.textContent = error.message;
  }
}

async function refreshJournal() {
  if (!journalEntries) return;
  journalEntries.innerHTML = '<div class="empty-card"><p>Loading journal…</p></div>';
  if (journalPhrases) journalPhrases.innerHTML = "";
  if (journalHero) journalHero.hidden = true;
  if (journalPhraseOfDay) journalPhraseOfDay.hidden = true;

  try {
    const q = journalSearch?.value || "";
    const [overview, entries, tags] = await Promise.all([
      getJournalOverview("month"),
      listJournalEntries(q),
      listTags()
    ]);

    journalOverviewCache = overview;
    journalEntryCache = entries;
    availableTags = tags;
    renderJournalTagOptions(tags);
    renderJournalHero(overview);
    renderJournalPhraseOfDay(overview);
    renderJournalEntries(filteredJournalEntries());
    renderMostViewedLessons(overview);
  } catch (error) {
    journalEntries.innerHTML = `
      <div class="empty-card">
        <h3>Journal could not be loaded</h3>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

function filteredJournalEntries() {
  return journalEntryCache.filter((entry) => {
    if (currentJournalFavorite && !entry.isFavorite) return false;
    if (!currentJournalFavorite && currentJournalStatus && readingStatus(entry) !== currentJournalStatus) {
      return false;
    }
    if (currentJournalTag && !(entry.tags || []).some((tag) => tag.slug === currentJournalTag)) {
      return false;
    }
    return true;
  });
}

function renderJournalTagOptions(tags) {
  if (!journalTagFilter) return;
  if (currentJournalTag && !tags.some((tag) => tag.slug === currentJournalTag)) {
    currentJournalTag = "";
    updateUiSettings({ journal: { tag: "" } });
  }
  journalTagFilter.innerHTML = `
    <option value="">All tags</option>
    ${tags.map((tag) => `<option value="${escapeHtml(tag.slug)}">${escapeHtml(tag.name)} (${tag.lessonCount})</option>`).join("")}
  `;
  journalTagFilter.value = currentJournalTag;
}

function renderJournalHero(overview) {
  if (!journalHero) return;
  const lesson = overview.inProgress;
  if (!lesson) {
    journalHero.hidden = true;
    return;
  }
  journalHero.hidden = false;
  const posterUrl = lesson.hasPoster
    ? `<img src="${escapeHtml(lesson.mediaUrls?.poster || '')}" alt="" />`
    : '<div class="lesson-card-poster-placeholder">EJ</div>';

  journalHero.innerHTML = `
    <p class="eyebrow">Continue learning</p>
    <button class="journal-hero-open" type="button" data-lesson-id="${escapeHtml(lesson.id)}">
      <div class="journal-hero-media">${posterUrl}</div>
      <div class="journal-hero-body">
        <span class="journal-continue-status">${escapeHtml(readingStatusLabel(readingStatus(lesson)))}</span>
        <h2>${escapeHtml(lesson.title)}</h2>
        <div class="journal-hero-meta">
          <span>${lesson.viewCount || 0} views</span>
          <span>${escapeHtml(durationLabel(lesson.durationMs))}</span>
        </div>
        <span class="source-link journal-hero-play">Resume lesson →</span>
      </div>
    </button>
  `;
  journalHero.querySelector("[data-lesson-id]")?.addEventListener("click", () => {
    void openLesson(lesson.id, "journal");
  });
}

function renderJournalPhraseOfDay(overview) {
  if (!journalPhraseOfDay || !journalPhraseOfDayText || !journalPhraseOfDayLink) return;
  const phrase = overview.phraseOfDay;
  if (!phrase) {
    journalPhraseOfDay.hidden = true;
    return;
  }
  journalPhraseOfDay.hidden = false;
  journalPhraseOfDayText.textContent = phrase.content;
  journalPhraseOfDayLink.href = "#";
  journalPhraseOfDayLink.onclick = (e) => {
    e.preventDefault();
    void openLesson(phrase.lessonId, "journal");
  };
}

function renderJournalEntries(entries) {
  if (!journalEntries) return;
  if (journalResultCount) {
    const suffix = entries.length === 1 ? "note" : "notes";
    journalResultCount.textContent = `${entries.length} ${suffix} shown`;
  }
  if (!entries.length) {
    const hasQuery = Boolean(journalSearch?.value.trim());
    const hasFilter = Boolean(currentJournalStatus || currentJournalFavorite || currentJournalTag);
    journalEntries.innerHTML = `
      <div class="empty-card">
        <span class="empty-icon">◎</span>
        <h3>${hasQuery || hasFilter ? "No matching notes" : "No journal entries yet"}</h3>
        <p>${hasQuery || hasFilter ? "Try another search, tag, or learning status." : "Open a lesson and fill in the Journal tab to see your thoughts here."}</p>
      </div>
    `;
    return;
  }

  const grouped = new Map();
  for (const entry of entries) {
    const key = entry.lessonId;
    if (!grouped.has(key)) {
      grouped.set(key, {
        lessonId: entry.lessonId,
        inboxItemId: entry.inboxItemId,
        lessonTitle: entry.lessonTitle,
        lessonSummaryVi: entry.lessonSummaryVi,
        media: entry.media || {},
        tags: entry.tags || [],
        learningStatus: entry.learningStatus,
        viewCount: entry.viewCount,
        isFavorite: entry.isFavorite,
        updatedAt: entry.updatedAt,
        entries: []
      });
    }
    const group = grouped.get(key);
    group.entries.push(entry);
    if (String(entry.updatedAt || "") > String(group.updatedAt || "")) {
      group.updatedAt = entry.updatedAt;
    }
  }

  const fieldLabels = {
    WHY_I_SAVED: "Why I saved",
    MY_THOUGHT: "My thought",
    FAVORITE_PHRASE: "Favorite phrase",
    MY_EXAMPLE: "My example"
  };

  journalEntries.innerHTML = [...grouped.values()].map((group) => {
    const posterUrl = group.media?.posterUrl || "";
    const backgroundStyle = posterUrl
      ? ` style="--journal-poster-bg: url('${escapeHtml(posterUrl)}')"`
      : "";
    const poster = group.media?.posterUrl
      ? `<img src="${escapeHtml(group.media.posterUrl)}" alt="" loading="lazy" />`
      : '<div class="lesson-card-poster-placeholder">EJ</div>';
    const entryCards = group.entries.map((entry) => `
      <div class="journal-entry-card">
        <span class="journal-entry-type">${escapeHtml(fieldLabels[entry.entryType] || entry.entryType)}</span>
        <p class="journal-entry-content">${escapeHtml(entry.content)}</p>
      </div>
    `).join("");

    return `
      <article class="journal-lesson-group"${backgroundStyle}>
        <button class="journal-lesson-header" type="button" data-lesson-id="${escapeHtml(group.lessonId)}">
          <div class="journal-lesson-poster">${poster}</div>
          <div>
            <h3>${escapeHtml(group.lessonTitle)}</h3>
            <p>${escapeHtml(readingStatusLabel(readingStatus(group)))} · Updated ${escapeHtml(formatJournalDate(group.updatedAt))}</p>
            ${tagChipsMarkup(group.tags, { limit: 4 })}
          </div>
          <span class="journal-entry-count">Open lesson →</span>
        </button>
        <div class="journal-entry-list">${entryCards}</div>
      </article>
    `;
  }).join("");

  for (const header of journalEntries.querySelectorAll("[data-lesson-id]")) {
    header.addEventListener("click", () => {
      void openLesson(header.dataset.lessonId, "journal");
    });
  }
}

function renderMostViewedLessons(overview) {
  if (!journalPhrases) return;
  const lessons = overview.mostViewedLessons || [];
  if (lessons.length) {
    journalPhrases.innerHTML = lessons.slice(0, 5).map((lesson, index) => `
      <button
        class="journal-phrase-chip"
        type="button"
        data-lesson-id="${escapeHtml(lesson.id)}"
        data-preview-title="${escapeHtml(lesson.title)}"
        data-preview-summary="${escapeHtml(lesson.summaryVi || "")}"
        data-preview-views="${escapeHtml(String(lesson.viewCount || 0))}"
        data-preview-status="${escapeHtml(readingStatusLabel(readingStatus(lesson)))}"
        data-preview-reading-status="${escapeHtml(readingStatus(lesson))}"
        data-preview-poster="${escapeHtml(lesson.mediaUrls?.poster || "")}"
      >
        <span class="journal-phrase-rank">${index + 1}</span>
        <span class="journal-phrase-text">
          ${escapeHtml(lesson.title)}
          <small>${lesson.viewCount || 0} views · ${escapeHtml(readingStatusLabel(readingStatus(lesson)))}</small>
        </span>
      </button>
    `).join("");

    for (const chip of journalPhrases.querySelectorAll("[data-lesson-id]")) {
      chip.addEventListener("click", () => {
        void openLesson(chip.dataset.lessonId, "journal");
      });
      chip.addEventListener("mouseenter", showLessonPreview);
      chip.addEventListener("mousemove", positionLessonPreview);
      chip.addEventListener("mouseleave", hideLessonPreview);
    }
  } else {
    journalPhrases.innerHTML = '<p class="muted-copy">No views recorded yet.</p>';
  }
}

function renderLibraryTags(tags) {
  if (!libraryTagList) return;
  availableTags = tags;
  if (currentLibraryTag && !tags.some((tag) => tag.slug === currentLibraryTag)) {
    currentLibraryTag = "";
    updateUiSettings({ library: { tag: "" } });
  }
  libraryTagList.classList.toggle("is-expanded", libraryTagsExpanded);
  libraryTagList.innerHTML = `
    <button class="library-tag${currentLibraryTag ? "" : " is-active"}" type="button" data-library-tag="">All topics</button>
    ${tags.map((tag) => `
      <button class="library-tag${currentLibraryTag === tag.slug ? " is-active" : ""}" type="button" data-library-tag="${escapeHtml(tag.slug)}">
        <span>#${escapeHtml(tag.name)}</span><small>${tag.lessonCount}</small>
      </button>
    `).join("")}
  `;

  for (const button of libraryTagList.querySelectorAll("[data-library-tag]")) {
    button.addEventListener("click", async () => {
      currentLibraryTag = button.dataset.libraryTag || "";
      updateUiSettings({ library: { tag: currentLibraryTag } });
      await refreshLibrary();
    });
  }

  window.requestAnimationFrame(() => {
    if (!libraryTagsMore) return;
    const overflows = libraryTagList.scrollHeight > libraryTagList.clientHeight + 2;
    libraryTagsMore.hidden = !libraryTagsExpanded && !overflows;
    if (libraryTagsExpanded && tags.length > 5) libraryTagsMore.hidden = false;
    libraryTagsMore.textContent = libraryTagsExpanded ? "Show less" : "See more";
  });
}

async function refreshLibrary() {
  if (!libraryLessons) return;
  libraryLessons.innerHTML = '<div class="empty-card"><p>Searching your library…</p></div>';

  try {
    const [lessons, tags] = await Promise.all([
      listLessons({
        q: librarySearch?.value || "",
        status: currentLibraryStatus,
        favorite: currentLibraryFavorite,
        tag: currentLibraryTag,
        limit: 200
      }),
      listTags()
    ]);

    libraryLessonMap = new Map(lessons.map((lesson) => [lesson.id, lesson]));
    renderLibraryTags(tags);

    if (!lessons.length) {
      libraryLessons.innerHTML = `
        <div class="empty-card">
          <span class="empty-icon">◎</span>
          <h3>No lessons found</h3>
          <p>Try another search or add a source.</p>
        </div>
      `;
      return;
    }

    libraryLessons.innerHTML = lessons.map(lessonCardMarkup).join("");
    bindLibraryCards(libraryLessons);
  } catch (error) {
    libraryLessons.innerHTML = `
      <div class="empty-card">
        <h3>Library could not be loaded</h3>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

for (const link of navLinks) {
  link.addEventListener("click", () => void showPage(link.dataset.page));
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

for (const filter of libraryStatusFilters) {
  filter.addEventListener("click", async () => {
    currentLibraryStatus = filter.dataset.libraryStatus;
    currentLibraryFavorite = false;
    libraryStatusFilters.forEach((item) => {
      item.classList.toggle("is-active", item === filter);
    });
    libraryFavoriteFilters.forEach((item) => {
      item.classList.remove("is-active");
      item.textContent = "♡";
    });
    updateUiSettings({
      library: {
        status: currentLibraryStatus,
        favorite: currentLibraryFavorite
      }
    });
    await refreshLibrary();
  });
}

for (const filter of libraryFavoriteFilters) {
  filter.addEventListener("click", async () => {
    currentLibraryStatus = "";
    currentLibraryFavorite = true;
    libraryStatusFilters.forEach((item) => item.classList.remove("is-active"));
    libraryFavoriteFilters.forEach((item) => {
      item.classList.toggle("is-active", item === filter);
      item.textContent = item === filter ? "♥" : "♡";
    });
    updateUiSettings({
      library: {
        status: currentLibraryStatus,
        favorite: currentLibraryFavorite
      }
    });
    await refreshLibrary();
  });
}

librarySearch?.addEventListener("input", () => {
  updateUiSettings({ library: { search: librarySearch.value } });
  if (librarySearchTimer) window.clearTimeout(librarySearchTimer);
  librarySearchTimer = window.setTimeout(() => {
    void refreshLibrary();
  }, 250);
});

libraryTagsMore?.addEventListener("click", () => {
  libraryTagsExpanded = !libraryTagsExpanded;
  updateUiSettings({ library: { tagsExpanded: libraryTagsExpanded } });
  renderLibraryTags(availableTags);
});

let journalSearchTimer = null;
journalSearch?.addEventListener("input", () => {
  updateUiSettings({ journal: { search: journalSearch.value } });
  if (journalSearchTimer) window.clearTimeout(journalSearchTimer);
  journalSearchTimer = window.setTimeout(() => {
    void refreshJournal();
  }, 300);
});

for (const filter of journalStatusFilters) {
  filter.addEventListener("click", () => {
    currentJournalStatus = filter.dataset.journalStatus || "";
    currentJournalFavorite = false;
    syncJournalFilters();
    updateUiSettings({
      journal: {
        status: currentJournalStatus,
        favorite: false
      }
    });
    renderJournalEntries(filteredJournalEntries());
  });
}

for (const filter of journalFavoriteFilters) {
  filter.addEventListener("click", () => {
    currentJournalFavorite = !currentJournalFavorite;
    if (currentJournalFavorite) currentJournalStatus = "";
    syncJournalFilters();
    updateUiSettings({
      journal: {
        status: currentJournalStatus,
        favorite: currentJournalFavorite
      }
    });
    renderJournalEntries(filteredJournalEntries());
  });
}

journalTagFilter?.addEventListener("change", () => {
  currentJournalTag = journalTagFilter.value;
  updateUiSettings({ journal: { tag: currentJournalTag } });
  renderJournalEntries(filteredJournalEntries());
});

journalSurprise?.addEventListener("click", async () => {
  journalSurprise.disabled = true;
  journalSurprise.textContent = "Rolling…";
  try {
    const overview = await getJournalOverview();
    if (overview.randomLesson) {
      void openLesson(overview.randomLesson.id, "journal");
    }
  } catch {
    // ignore
  } finally {
    journalSurprise.disabled = false;
    journalSurprise.textContent = "Surprise me";
  }
});

journalStatsBtn?.addEventListener("click", async () => {
  if (!statsDialog || !statsContent) return;
  statsContent.innerHTML = '<p class="muted-copy">Loading stats…</p>';
  statsDialog.showModal();
  try {
    const now = new Date();
    await fetchAndRenderStats(now.getMonth() + 1, now.getFullYear());
  } catch (error) {
    statsContent.innerHTML = `<p class="muted-copy">Could not load stats: ${escapeHtml(error.message)}</p>`;
  }
});

let currentStatsMonth = null;
let currentStatsYear = null;
let currentStatsPeriod = "month";

async function fetchAndRenderStats(month, year, period) {
  currentStatsMonth = month;
  currentStatsYear = year;
  currentStatsPeriod = period;
  const overview = await getJournalOverview(period, month, year);
  journalOverviewCache = overview;
  renderStatsPopup(overview);
}

function renderStatsPopup(overview) {
  if (!statsContent) return;
  const daily = overview.dailyActivity || [];
  const sm = overview.selectedMonth || {};
  const period = overview.period || "month";

  const periodTabs = ["week", "month"].map((p) =>
    `<button class="filter-chip${period === p ? " is-active" : ""}" type="button" data-stats-period="${p}">${p === "week" ? "Week" : "Month"}</button>`
  ).join("");

  statsContent.innerHTML = `
    <div class="stats-period-row">
      ${periodTabs}
    </div>

    ${period === "month" ? `
    <div class="stats-month-nav">
      <button class="secondary-action" type="button" data-stats-prev>←</button>
      <span class="stats-month-label">${escapeHtml(sm.label || "")}</span>
      <button class="secondary-action" type="button" data-stats-next>→</button>
    </div>
    ` : `<p class="eyebrow" style="text-align:center;margin-bottom:var(--space-md)">${escapeHtml(sm.label || "")}</p>`}

    <div class="stats-section">
      <p class="eyebrow">Daily activity</p>
      <div class="stats-chart" id="stats-histogram"></div>
    </div>

    <div class="stats-section">
      <p class="eyebrow">Cumulative listens</p>
      <div class="stats-chart" id="stats-line"></div>
    </div>
  `;

  if (daily.length) {
    drawHistogram(daily);
    drawLineChart(daily);
  }

  const now = new Date();
  const prevBtn = statsContent.querySelector("[data-stats-prev]");
  const nextBtn = statsContent.querySelector("[data-stats-next]");
  prevBtn?.addEventListener("click", async () => {
    let m = sm.month - 1;
    let y = sm.year;
    if (m < 1) { m = 12; y--; }
    await fetchAndRenderStats(m, y, "month");
  });
  nextBtn?.addEventListener("click", async () => {
    let m = sm.month + 1;
    let y = sm.year;
    if (m > 12) { m = 1; y++; }
    await fetchAndRenderStats(m, y, "month");
  });

  for (const btn of statsContent.querySelectorAll("[data-stats-period]")) {
    btn.addEventListener("click", async () => {
      const p = btn.dataset.statsPeriod;
      await fetchAndRenderStats(now.getMonth() + 1, now.getFullYear(), p);
    });
  }
}

function drawHistogram(daily) {
  const el = document.querySelector("#stats-histogram");
  if (!el) return;
  const maxVal = Math.max(...daily.map((d) => Math.max(d.listens, d.loops)), 1);
  const yMax = Math.ceil(maxVal * 1.15);
  const barW = Math.max(1, Math.floor(360 / daily.length) - 3);
  const gap = barW > 4 ? 2 : 1;
  const padding = { top: 14, right: 6, bottom: 20, left: 28 };
  const totalW = Math.max(280, daily.length * (barW + gap) + padding.left + padding.right);
  const chartH = 130;
  const barAreaH = chartH - padding.top - padding.bottom;

  const ticks = 3;
  let svg = `<svg viewBox="0 0 ${totalW} ${chartH}" class="stats-svg" aria-label="Daily histogram">`;
  for (let t = 0; t <= ticks; t++) {
    const y = padding.top + (barAreaH - (t / ticks) * barAreaH);
    const val = Math.round((t / ticks) * yMax);
    svg += `<line x1="${padding.left - 3}" y1="${y}" x2="${totalW - padding.right}" y2="${y}" stroke="var(--line)" stroke-width="0.5" stroke-dasharray="3,3"/>`;
    svg += `<text x="${padding.left - 6}" y="${y + 4}" text-anchor="end" font-size="9" fill="var(--muted)">${val}</text>`;
  }

  daily.forEach((d, i) => {
    const x = padding.left + i * (barW + gap);
    const listenH = Math.max(1, (d.listens / yMax) * barAreaH);
    const loopH = Math.max(1, (d.loops / yMax) * barAreaH);
    const halfW = barW / 2;

    svg += `<rect x="${x}" y="${padding.top + barAreaH - listenH}" width="${halfW - 0.5}" height="${listenH}" rx="1.5" fill="var(--accent)" opacity="0.8"><title>${d.label}: ${d.listens} listens</title></rect>`;
    svg += `<rect x="${x + halfW + 0.5}" y="${padding.top + barAreaH - loopH}" width="${halfW - 0.5}" height="${loopH}" rx="1.5" fill="#d97706" opacity="0.8"><title>${d.label}: ${d.loops} loops</title></rect>`;

    if (daily.length <= 31 && i % Math.ceil(daily.length / 12) === 0) {
      svg += `<text x="${x + halfW}" y="${chartH - 4}" text-anchor="middle" font-size="8" fill="var(--muted)">${d.label}</text>`;
    }
  });

  svg += "</svg>";
  el.innerHTML = svg;
}

function drawLineChart(daily) {
  const el = document.querySelector("#stats-line");
  if (!el) return;

  let cumulative = 0;
  const points = daily.map((d) => {
    cumulative += d.listens;
    return { label: d.label, value: cumulative };
  });

  const maxVal = Math.max(points[points.length - 1]?.value || 0, 1);
  const yMax = Math.ceil(maxVal * 1.2);
  const padding = { top: 8, right: 24, bottom: 20, left: 36 };
  const chartW = 340;
  const chartH = 100;
  const areaW = chartW - padding.left - padding.right;
  const areaH = chartH - padding.top - padding.bottom;

  const pts = points.map((p, i) => {
    const x = padding.left + (i / Math.max(points.length - 1, 1)) * areaW;
    const y = padding.top + areaH - (p.value / yMax) * areaH;
    return `${x},${y}`;
  }).join(" ");

  const fillPath = points.length > 1
    ? `M${padding.left},${padding.top + areaH} L${pts} L${padding.left + areaW},${padding.top + areaH} Z`
    : "";

  let svg = `<svg viewBox="0 0 ${chartW} ${chartH}" class="stats-svg" aria-label="Cumulative listens">`;

  const ticks = 3;
  for (let t = 0; t <= ticks; t++) {
    const y = padding.top + (areaH - (t / ticks) * areaH);
    const val = Math.round((t / ticks) * yMax);
    svg += `<line x1="${padding.left}" y1="${y}" x2="${chartW - padding.right}" y2="${y}" stroke="var(--line)" stroke-width="0.5" stroke-dasharray="3,3"/>`;
    svg += `<text x="${padding.left - 6}" y="${y + 4}" text-anchor="end" font-size="9" fill="var(--muted)">${val}</text>`;
  }

  if (fillPath) {
    svg += `<path d="${fillPath}" fill="var(--accent)" opacity="0.08"/>`;
  }
  svg += `<polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;

  const last = points[points.length - 1];
  if (last) {
    const lx = padding.left + ((points.length - 1) / Math.max(points.length - 1, 1)) * areaW;
    const ly = padding.top + areaH - (last.value / yMax) * areaH;
    svg += `<circle cx="${lx}" cy="${ly}" r="4" fill="var(--surface-strong)" stroke="var(--accent)" stroke-width="2"/>`;
    svg += `<text x="${lx}" y="${ly - 8}" text-anchor="end" font-size="10" font-weight="700" fill="var(--accent)">${last.value}</text>`;
  }

  svg += "</svg>";
  el.innerHTML = svg;
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
    personalNote: formData.get("personalNote"),
    autoProcess: true
  };

  captureError.hidden = true;

  try {
    await createInbox(payload);
    dialog.close();
    showPage("library");
  } catch (error) {
    captureError.textContent = error.message;
    captureError.hidden = false;
  }
});

async function refreshShareExports() {
  if (!shareExportsList) return;
  shareExportsList.innerHTML = '<div class="empty-card"><p>Loading exports…</p></div>';
  try {
    const entries = await listShareExports();
    if (!entries.length) {
      shareExportsList.innerHTML = `
        <article class="share-compact-item">
          <div>
            <p class="muted-copy">No exports yet. Select lessons and create your first zip.</p>
          </div>
        </article>
      `;
      return;
    }
    shareExportsList.innerHTML = entries.map((entry) => `
      <article class="share-compact-item" data-share-export="${escapeHtml(entry.filename)}">
        <div class="share-compact-main">
          <strong>${escapeHtml(entry.filename)}</strong>
          <span>${bytesLabel(entry.size)} · ${escapeHtml(new Date(entry.createdAt).toLocaleString())}</span>
        </div>
        <div class="share-compact-actions">
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
  shareRegistryList.innerHTML = '<div class="empty-card"><p>Loading deleted lessons…</p></div>';
  try {
    const entries = await listShareRegistry("deleted");
    if (!entries.length) {
      shareRegistryList.innerHTML = `
        <article class="share-compact-item">
          <div>
            <p class="muted-copy">No deleted lessons are being skipped during imports.</p>
          </div>
        </article>
      `;
      return;
    }

    shareRegistryList.innerHTML = entries.map((entry) => {
      const slug = entry.slug && entry.slug.length > 60
        ? `${entry.slug.slice(0, 60)}…`
        : entry.slug;
      return `
        <article class="share-compact-item" data-share-slug="${escapeHtml(entry.slug)}">
          <div class="share-compact-main">
            <strong>${escapeHtml(entry.title || "Untitled")}</strong>
            <span>${escapeHtml(entry.sourceUrl || "No source URL")}</span>
            <span>Slug: ${escapeHtml(slug)}</span>
          </div>
          <div class="share-compact-actions">
            <button class="auto-action" type="button" data-share-restore>Restore eligibility</button>
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
        <h3>Deleted lessons could not be loaded</h3>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

async function refreshShare() {
  await Promise.all([
    void refreshShareExports(),
    void refreshShareRegistry(),
    void refreshShareLessonList()
  ]);
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
        <article class="share-empty-row">
          <div>
            <p class="muted-copy">No lessons ready. Generate a lesson first.</p>
          </div>
        </article>
      `;
      return;
    }

    if (hideExported && !visible.length) {
      shareLessonList.innerHTML = `
        <article class="share-empty-row">
          <div>
            <p class="muted-copy">All lessons already exported. Uncheck "Hide already exported" to re-export.</p>
          </div>
        </article>
      `;
      updateExportButton();
      return;
    }

    shareSelectedIds = new Set(
      [...shareSelectedIds].filter((id) => visible.some((l) => l.lessonId === id))
    );

    shareLessonList.innerHTML = shareLessonData.map((lesson) => {
      const hiddenAttr = hideExported && lesson.alreadyExported ? " hidden" : "";
      return `
        <article class="share-lesson-card"${hiddenAttr} data-share-lesson="${escapeHtml(lesson.lessonId)}">
          <label class="share-lesson-label">
            <input class="share-lesson-checkbox" type="checkbox"
              data-lesson-id="${escapeHtml(lesson.lessonId)}"
              ${shareSelectedIds.has(lesson.lessonId) ? "checked" : ""}
            />
            <span class="share-lesson-content">
              <strong>${escapeHtml(lesson.title)}</strong>
              <span>${escapeHtml(lesson.sourceUrl || "No source URL")}</span>
              ${lesson.alreadyExported
                ? `<em>Exported ${escapeHtml(new Date(lesson.lastExportedAt).toLocaleString())}</em>`
                : ""}
            </span>
            <span class="status-badge">${escapeHtml(durationLabel(lesson.durationMs))}</span>
          </label>
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
  const hideExported = shareHideExported?.checked ?? true;
  const visibleCount = shareLessonData.filter((lesson) => !hideExported || !lesson.alreadyExported).length;
  const exportedCount = shareLessonData.filter((lesson) => lesson.alreadyExported).length;
  shareExportSelected.textContent = count ? `Export selected (${count})` : "Export selected (0)";
  shareExportSelected.disabled = count === 0;
  if (shareSelectionSummary) {
    shareSelectionSummary.textContent = `${count} selected · ${visibleCount} visible · ${exportedCount} already exported`;
  }
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

for (const button of document.querySelectorAll("[data-close-metadata]")) {
  button.addEventListener("click", () => {
    metadataDialog?.close();
    metadataEditingLesson = null;
  });
}

metadataDialog?.addEventListener("click", (event) => {
  if (event.target === metadataDialog) {
    metadataDialog.close();
    metadataEditingLesson = null;
  }
});

metadataPromptButton?.addEventListener("click", async () => {
  if (!metadataEditingLesson) return;
  const prompt = buildMetadataPrompt(metadataEditingLesson);
  const copied = await copyText(prompt);
  metadataPromptButton.title = copied ? "Prompt copied" : "Copy failed";
  metadataPromptButton.classList.toggle("is-copied", copied);
  window.setTimeout(() => {
    metadataPromptButton.title = "Copy Prompt";
    metadataPromptButton.classList.remove("is-copied");
  }, 1600);
});

metadataForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!metadataEditingLesson) return;

  const submit = metadataForm.querySelector("button[type='submit']");
  metadataError.hidden = true;
  metadataError.textContent = "";
  submit.disabled = true;
  submit.textContent = "Saving...";

  try {
    const parsed = parseMetadataResponse(metadataForm.elements.metadataResponse.value);
    const title = String(parsed.title || "").trim();
    const content = String(parsed.content || "").trim();
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags.map((tag) => String(tag || "").trim()).filter(Boolean).slice(0, 6)
      : [];
    if (!title || !content || !tags.length) {
      throw new Error('Paste JSON with "title", "content", and at least one tag.');
    }

    await updateLessonMetadata(metadataEditingLesson.lesson.id, {
      title,
      summaryVi: content,
      sourceTitle: title,
      tags
    });
    metadataDialog?.close();
    metadataEditingLesson = null;
    await refreshLibrary();
  } catch (error) {
    metadataError.hidden = false;
    metadataError.textContent = error.message;
  } finally {
    submit.disabled = false;
    submit.textContent = "Save update";
  }
});

let scrollSaveTimer = null;
window.addEventListener("scroll", () => {
  if (scrollSaveTimer) window.clearTimeout(scrollSaveTimer);
  scrollSaveTimer = window.setTimeout(saveCurrentScroll, 160);
}, { passive: true });
window.addEventListener("beforeunload", saveCurrentScroll);

const requestedPage = new URLSearchParams(window.location.search).get("page");
const initialPage = supportedPages.has(requestedPage) ? requestedPage : currentPage;
await showPage(initialPage, { updateUrl: false });

const savedLesson = getUiSettings().lesson;
if (savedLesson?.id && (!requestedPage || savedLesson.returnPage === initialPage)) {
  await openLesson(savedLesson.id, savedLesson.returnPage || initialPage, savedLesson.player || {});
} else if (requestedPage && savedLesson) {
  updateUiSettings({ lesson: null });
}

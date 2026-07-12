import {
  createInbox,
  deleteInbox,
  getTranscript,
  listLessons,
  startAutomaticAnalysis,
  updateTranscriptSegment,
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
let currentLibraryStatus = "";
let currentShareStatus = "";
let librarySearchTimer = null;
let returnPageAfterLesson = "library";

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

function lessonCardMarkup(item) {
  const poster = item.media?.posterUrl
    ? `<img src="${escapeHtml(item.media.posterUrl)}" alt="" loading="lazy" />`
    : '<div class="lesson-card-poster-placeholder">EJ</div>';

  return `
    <article class="lesson-card" data-lesson-id="${escapeHtml(item.id)}" data-inbox-id="${escapeHtml(item.inboxItemId || "")}">
      <button class="lesson-card-delete" type="button" title="Delete lesson" data-lesson-delete>×</button>
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
      <div class="lesson-card-actions">
        ${item.sourceUrl ? `<a class="source-link" href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noreferrer">Open source</a>` : ""}
        <button class="secondary-action regenerate-action" type="button" data-lesson-regenerate>Regenerate lesson</button>
      </div>
      <details class="lesson-transcript-preview">
        <summary>Review transcript</summary>
        <div class="lesson-transcript-content"></div>
      </details>
    </article>
  `;
}

async function loadTranscriptForCard(card) {
  const lessonId = card.dataset.lessonId;
  const inboxId = card.dataset.inboxId;
  const details = card.querySelector(".lesson-transcript-preview");
  const content = card.querySelector(".lesson-transcript-content");
  if (!inboxId || !details || !content) return;

  details.addEventListener("toggle", async () => {
    if (!details.open || content.dataset.loaded === "true") return;
    content.innerHTML = "<p class=\"muted-copy\">Loading transcript…</p>";
    try {
      const transcript = await getTranscript(inboxId);
      content.dataset.loaded = "true";
      content.innerHTML = transcript.segments.map((segment) => {
        const effective = segment.reviewedText || segment.cleanedText || segment.rawText;
        return `
          <div class="transcript-segment" data-segment-id="${segment.id}">
            <span class="segment-time">${formatTime(segment.startMs)}</span>
            <div class="segment-editor">
              <textarea rows="2">${escapeHtml(effective)}</textarea>
              <div class="segment-actions">
                <span class="segment-origin">${segment.reviewStatus === "REVIEWED" ? "Reviewed" : "Cleaned"}</span>
                <button class="segment-save" type="button">Save correction</button>
              </div>
            </div>
          </div>
        `;
      }).join("");

      for (const row of content.querySelectorAll(".transcript-segment")) {
        const textarea = row.querySelector("textarea");
        const saveButton = row.querySelector(".segment-save");
        const origin = row.querySelector(".segment-origin");
        saveButton.addEventListener("click", async () => {
          saveButton.disabled = true;
          saveButton.textContent = "Saving…";
          try {
            await updateTranscriptSegment(inboxId, row.dataset.segmentId, textarea.value);
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
      content.innerHTML = "<p class=\"muted-copy\">Transcript not found. Generate a lesson first.</p>";
    }
  });
}

function bindLibraryCards(container) {
  for (const card of container.querySelectorAll("[data-lesson-id]")) {
    card.querySelector(".lesson-card-open")?.addEventListener("click", () => {
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
        await refreshToday();
      } catch (error) {
        window.alert(error.message);
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

    loadTranscriptForCard(card);
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
          <p>Add a source from the Library page and your next listening moment will appear here.</p>
        </div>
      `;
      return;
    }

    todayLessons.innerHTML = lessons.map(lessonCardMarkup).join("");
    bindLibraryCards(todayLessons);
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
            <p class="muted-copy">No entries yet. This fills automatically.</p>
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

async function refreshShare() {
  await Promise.all([
    void refreshShareExports(),
    void refreshShareRegistry(),
    void refreshShareLessonList()
  ]);
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

const initialPage = new URLSearchParams(window.location.search).get("page");
const supportedInitialPages = new Set(["today", "library", "journal", "share"]);
showPage(supportedInitialPages.has(initialPage) ? initialPage : "today", { updateUrl: false });
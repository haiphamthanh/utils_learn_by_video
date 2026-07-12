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
  listExportableLessons,
  listJournalEntries,
  getJournalOverview,
  updateLessonProgress
} from "./api.js";
import { createLessonPlayer } from "./lesson-player.js";

const pages = [...document.querySelectorAll(".page")];
const navLinks = [...document.querySelectorAll(".nav-link")];
const dialog = document.querySelector("#capture-dialog");
const captureForm = document.querySelector("#capture-form");
const captureError = document.querySelector("#capture-error");
const libraryLessons = document.querySelector("#library-lessons");
const librarySearch = document.querySelector("#library-search");
const libraryStatusFilters = [...document.querySelectorAll("[data-library-status]")];
const journalEntries = document.querySelector("#journal-entries");
const journalPhrases = document.querySelector("#journal-phrases");
const journalSearch = document.querySelector("#journal-search");
const journalHero = document.querySelector("#journal-hero");
const journalRecent = document.querySelector("#journal-recent");
const journalRecentList = document.querySelector("#journal-recent-list");
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
let journalOverviewCache = null;
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
    const url = pageName === "journal" ? "/" : `/?page=${encodeURIComponent(pageName)}`;
    window.history.replaceState({}, "", url);
  }

  if (pageName === "journal") void refreshJournal();
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
      <button
        class="lesson-card-favorite${item.isFavorite ? " is-active" : ""}"
        type="button"
        title="${item.isFavorite ? "Remove favorite" : "Add favorite"}"
        aria-pressed="${item.isFavorite ? "true" : "false"}"
        data-lesson-favorite
      >${item.isFavorite ? "Favorited" : "Favorite"}</button>
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
        btn.textContent = isFavorite ? "Favorited" : "Favorite";
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

    loadTranscriptForCard(card);
  }
}

async function refreshJournal() {
  if (!journalEntries) return;
  journalEntries.innerHTML = '<div class="empty-card"><p>Loading journal…</p></div>';
  if (journalPhrases) journalPhrases.innerHTML = "";
  if (journalHero) journalHero.hidden = true;
  if (journalRecent) journalRecent.hidden = true;
  if (journalPhraseOfDay) journalPhraseOfDay.hidden = true;

  try {
    const q = journalSearch?.value || "";
    const [overview, entries] = await Promise.all([
      getJournalOverview("month"),
      listJournalEntries(q)
    ]);

    journalOverviewCache = overview;
    renderJournalHero(overview);
    renderJournalRecent(overview);
    renderJournalPhraseOfDay(overview);
    renderJournalEntries(entries);
    renderJournalPhrases(entries);
  } catch (error) {
    journalEntries.innerHTML = `
      <div class="empty-card">
        <h3>Journal could not be loaded</h3>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  }
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
    <button class="journal-hero-open" type="button" data-lesson-id="${escapeHtml(lesson.id)}">
      <div class="journal-hero-media">${posterUrl}</div>
      <div class="journal-hero-body">
        <p class="eyebrow">Continue learning</p>
        <h2>${escapeHtml(lesson.title)}</h2>
        <div class="journal-hero-meta">
          <span>${escapeHtml(lesson.learningStatus || "NEW")}</span>
          <span>${lesson.listenCount || 0} listens · ${lesson.shadowCount || 0} loops</span>
          <span>${escapeHtml(durationLabel(lesson.durationMs))}</span>
        </div>
        <span class="primary-action journal-hero-play">▶ Play</span>
      </div>
    </button>
  `;
  journalHero.querySelector("[data-lesson-id]")?.addEventListener("click", () => {
    void openLesson(lesson.id, "journal");
  });
}

function renderJournalRecent(overview) {
  if (!journalRecent || !journalRecentList) return;
  const lessons = (overview.recentLessons || []).slice(0, 8);
  if (!lessons.length) {
    journalRecent.hidden = true;
    return;
  }
  journalRecent.hidden = false;
  journalRecentList.innerHTML = lessons.map((lesson) => {
    const poster = lesson.hasPoster
      ? `<img src="${escapeHtml(lesson.mediaUrls?.poster || '')}" alt="" loading="lazy" />`
      : '<div class="journal-recent-poster-placeholder">EJ</div>';
    return `
      <button class="journal-recent-card" type="button" data-lesson-id="${escapeHtml(lesson.id)}">
        <div class="journal-recent-media">${poster}</div>
        <div class="journal-recent-body">
          <strong>${escapeHtml(lesson.title)}</strong>
          <small>${escapeHtml(lesson.learningStatus)} · ${lesson.listenCount || 0} listens</small>
        </div>
      </button>
    `;
  }).join("");

  for (const card of journalRecentList.querySelectorAll("[data-lesson-id]")) {
    card.addEventListener("click", () => {
      void openLesson(card.dataset.lessonId, "journal");
    });
  }
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
  if (!entries.length) {
    journalEntries.innerHTML = `
      <div class="empty-card">
        <span class="empty-icon">◎</span>
        <h3>No journal entries yet</h3>
        <p>Open a lesson and fill in the Journal tab to see your thoughts here.</p>
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
        entries: []
      });
    }
    grouped.get(key).entries.push(entry);
  }

  const fieldLabels = {
    WHY_I_SAVED: "Why I saved",
    MY_THOUGHT: "My thought",
    FAVORITE_PHRASE: "Favorite phrase",
    MY_EXAMPLE: "My example"
  };

  journalEntries.innerHTML = [...grouped.values()].map((group) => {
    const entryCards = group.entries.map((entry) => `
      <div class="journal-entry-card">
        <span class="journal-entry-type">${escapeHtml(fieldLabels[entry.entryType] || entry.entryType)}</span>
        <p class="journal-entry-content">${escapeHtml(entry.content)}</p>
      </div>
    `).join("");

    return `
      <article class="journal-lesson-group">
        <button class="journal-lesson-header" type="button" data-lesson-id="${escapeHtml(group.lessonId)}">
          <div>
            <h3>${escapeHtml(group.lessonTitle)}</h3>
            ${group.lessonSummaryVi ? `<p>${escapeHtml(group.lessonSummaryVi)}</p>` : ""}
          </div>
          <span class="journal-entry-count">${group.entries.length} note(s)</span>
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

function renderJournalPhrases(entries) {
  if (!journalPhrases) return;
  const phraseEntries = entries.filter((e) => e.entryType === "FAVORITE_PHRASE");
  if (phraseEntries.length) {
    journalPhrases.innerHTML = phraseEntries.slice(0, 10).map((entry) => `
      <button class="journal-phrase-chip" type="button" data-lesson-id="${escapeHtml(entry.lessonId)}">
        "${escapeHtml(entry.content)}"
        <small>${escapeHtml(entry.lessonTitle)}</small>
      </button>
    `).join("");

    for (const chip of journalPhrases.querySelectorAll("[data-lesson-id]")) {
      chip.addEventListener("click", () => {
        void openLesson(chip.dataset.lessonId, "journal");
      });
    }
  } else {
    journalPhrases.innerHTML = '<p class="muted-copy">No favorite phrases saved yet.</p>';
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

let journalSearchTimer = null;
journalSearch?.addEventListener("input", () => {
  if (journalSearchTimer) window.clearTimeout(journalSearchTimer);
  journalSearchTimer = window.setTimeout(() => {
    void refreshJournal();
  }, 300);
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
const supportedInitialPages = new Set(["journal", "library", "share"]);
showPage(supportedInitialPages.has(initialPage) ? initialPage : "journal", { updateUrl: false });

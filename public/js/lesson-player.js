import {
  createLessonNote,
  deleteLessonNote,
  getLessonDetail,
  updateLessonJournal,
  updateLessonNote,
  updateLessonProgress
} from "./api.js";

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

function formatTime(milliseconds) {
  const totalSeconds = Math.floor(Number(milliseconds || 0) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function effectiveText(segment) {
  return segment.reviewedText || segment.cleanedText || segment.rawText || "";
}

function noteDateLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function todayDateTitle() {
  return new Date().toISOString().slice(0, 10);
}

function iconSvg(name) {
  const icons = {
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.4 5.4 0 0 0-7.7 0L12 5.7l-1.1-1.1a5.4 5.4 0 0 0-7.7 7.7L12 21l8.8-8.7a5.4 5.4 0 0 0 0-7.7Z"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>',
    restore: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-1"/></svg>'
  };
  return icons[name] || "";
}

export function createLessonPlayer({ root, onClose, onStateChange }) {
  let lesson = null;
  let media = null;
  let selectedSegmentId = null;
  let activeSegmentId = null;
  let activeTab = "listen";
  let lastSavedSecond = null;
  let loopEnabled = false;
  let loopCount = 0;
  let loopGuard = false;
  let loopTimer = null;
  let showHiddenNotes = false;
  let editingNoteId = null;

  function clearLoopTimer() {
    if (loopTimer) {
      window.clearTimeout(loopTimer);
      loopTimer = null;
    }
  }

  function resetRuntime() {
    media?.pause();
    clearLoopTimer();
    lesson = null;
    media = null;
    selectedSegmentId = null;
    activeSegmentId = null;
    activeTab = "listen";
    lastSavedSecond = null;
    loopEnabled = false;
    loopCount = 0;
    loopGuard = false;
    showHiddenNotes = false;
    editingNoteId = null;
  }

  function segments() {
    return lesson?.transcript?.segments || [];
  }

  function segmentById(id) {
    return segments().find((segment) => segment.id === id) || null;
  }

  function segmentIndex(id) {
    return segments().findIndex((segment) => segment.id === id);
  }

  function currentSegment() {
    if (!media) return null;
    const currentMs = media.currentTime * 1000;
    return segments().find(
      (segment) => currentMs >= segment.startMs && currentMs < segment.endMs
    ) || null;
  }

  function emitPlayerState({ force = false } = {}) {
    if (!lesson || typeof onStateChange !== "function") return;
    const currentTimeSeconds = media ? Math.max(0, media.currentTime || 0) : 0;
    const currentSecond = Math.floor(currentTimeSeconds);
    if (!force && currentSecond === lastSavedSecond) return;
    lastSavedSecond = currentSecond;
    onStateChange({
      lessonId: lesson.lesson.id,
      activeTab,
      selectedSegmentId,
      currentTimeSeconds,
      playbackRate: media?.playbackRate || 1
    });
  }

  function setSelectedSegment(segmentId, { seek = false, play = false } = {}) {
    const segment = segmentById(segmentId);
    if (!segment) return;

    selectedSegmentId = segment.id;
    loopCount = 0;

    for (const line of root.querySelectorAll("[data-segment-id]")) {
      line.classList.toggle("is-selected", line.dataset.segmentId === segment.id);
    }

    if (seek && media) {
      media.currentTime = segment.startMs / 1000;
      if (play) {
        media.play().catch(() => {});
      }
    }
    emitPlayerState({ force: true });
  }

  function setActiveSegment(segmentId) {
    if (activeSegmentId === segmentId) return;
    activeSegmentId = segmentId;

    for (const line of root.querySelectorAll("[data-segment-id]")) {
      line.classList.toggle("is-active", line.dataset.segmentId === segmentId);
    }

    const active = root.querySelector(`[data-segment-id="${CSS.escape(segmentId || "")}"]`);
    if (active && !active.matches(":hover")) {
      active.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  function updateLoopButton() {
    const button = root.querySelector("[data-loop-toggle]");
    if (!button) return;
    button.classList.toggle("is-active", loopEnabled);
    button.textContent = loopEnabled
      ? `Loop ×3 · ${Math.min(loopCount + 1, 3)}/3`
      : "Loop ×3";
  }

  function stopLoop() {
    loopEnabled = false;
    loopCount = 0;
    loopGuard = false;
    clearLoopTimer();
    updateLoopButton();
  }

  function startLoop() {
    const target = segmentById(selectedSegmentId) || currentSegment() || segments()[0];
    if (!target || !media) return;

    setSelectedSegment(target.id);
    loopEnabled = true;
    loopCount = 0;
    loopGuard = false;
    updateLoopButton();
    media.currentTime = target.startMs / 1000;
    media.play().catch(() => {});
  }

  function onTimeUpdate() {
    const active = currentSegment();
    setActiveSegment(active?.id || null);
    emitPlayerState();

    if (!loopEnabled || loopGuard || !media) return;
    const target = segmentById(selectedSegmentId);
    if (!target) return;

    if (media.currentTime * 1000 >= target.endMs - 60) {
      loopGuard = true;
      media.pause();
      loopCount += 1;
      updateLoopButton();

      if (loopCount >= 3) {
        stopLoop();
        void updateLessonProgress(lesson.lesson.id, "SHADOW_COMPLETED")
          .then((progress) => {
            lesson.progress = progress;
            renderProgress();
          })
          .catch(() => {});
        return;
      }

      loopTimer = window.setTimeout(() => {
        if (!loopEnabled || !media) return;
        media.currentTime = target.startMs / 1000;
        media.play().catch(() => {});
        loopGuard = false;
      }, 900);
    }
  }

  function renderProgress() {
    const toggle = root.querySelector("[data-progress-toggle]");
    const favorite = root.querySelector("[data-favorite-toggle]");
    if (!toggle || !lesson) return;

    const progress = lesson.progress || {};
    const isMastered = progress.status === "MASTERED";
    toggle.classList.toggle("is-active", isMastered);
    toggle.setAttribute("aria-pressed", String(isMastered));
    toggle.setAttribute("aria-label", isMastered ? "Mark as reading" : "Mark as read");
    toggle.title = isMastered ? "Mark as reading" : "Mark as read";
    toggle.innerHTML = iconSvg("check");
    if (favorite) {
      favorite.classList.toggle("is-active", Boolean(progress.isFavorite));
      favorite.setAttribute("aria-pressed", String(Boolean(progress.isFavorite)));
      favorite.setAttribute("aria-label", progress.isFavorite ? "Remove favorite" : "Add favorite");
      favorite.title = progress.isFavorite ? "Remove favorite" : "Add favorite";
      favorite.innerHTML = iconSvg("heart");
    }
  }

  function switchTab(tabName) {
    const supportedTabs = new Set(["listen", "meaning", "phrases", "journal"]);
    if (!supportedTabs.has(tabName)) tabName = "listen";
    activeTab = tabName;
    for (const button of root.querySelectorAll("[data-lesson-tab]")) {
      button.classList.toggle("is-active", button.dataset.lessonTab === tabName);
    }
    for (const panel of root.querySelectorAll("[data-lesson-panel]")) {
      panel.hidden = panel.dataset.lessonPanel !== tabName;
    }
    emitPlayerState({ force: true });
  }

  function renderTranscript() {
    const transcriptSegments = segments();
    if (!transcriptSegments.length) {
      return `
        <div class="lesson-empty-panel">
          <h3>No timed script available</h3>
          <p>This lesson does not have transcript segments yet. Regenerate the transcript/lesson after media processing completes.</p>
        </div>
      `;
    }

    return transcriptSegments.map((segment) => `
      <button class="lesson-transcript-line" type="button" data-segment-id="${escapeHtml(segment.id)}">
        <span class="lesson-transcript-time">${formatTime(segment.startMs)}</span>
        <span>${escapeHtml(effectiveText(segment))}</span>
      </button>
    `).join("");
  }

  function renderMeaning() {
    const meaning = lesson.learning?.meaning || [];
    if (!meaning.length) {
      return `
        <div class="lesson-empty-panel">
          <h3>No Vietnamese meaning yet</h3>
          <p>The local-basic provider keeps this section empty. Generate the lesson with the OpenAI provider for semantic translation.</p>
        </div>
      `;
    }

    const bySegment = new Map(meaning.map((item) => [item.segmentId, item.vi]));
    return segments()
      .filter((segment) => bySegment.has(segment.id))
      .map((segment) => `
        <button class="meaning-row" type="button" data-segment-id="${escapeHtml(segment.id)}">
          <span class="lesson-transcript-time">${formatTime(segment.startMs)}</span>
          <span>
            <strong>${escapeHtml(effectiveText(segment))}</strong>
            <small>${escapeHtml(bySegment.get(segment.id))}</small>
          </span>
        </button>
      `).join("");
  }

  function renderPhrases() {
    const learning = lesson.learning || {};
    const phrases = learning.keyPhrases || [];
    const patterns = learning.patterns || [];

    return `
      <div class="learning-section">
        <p class="eyebrow">Useful phrases</p>
        ${phrases.length ? phrases.map((item) => `
          <article class="learning-card">
            <strong>${escapeHtml(item.phrase)}</strong>
            <p>${escapeHtml(item.meaningVi || "")}</p>
            <small>${escapeHtml(item.whyUseful || "")}</small>
          </article>
        `).join("") : '<p class="muted-copy">No phrases generated.</p>'}
      </div>
      <div class="learning-section">
        <p class="eyebrow">Patterns</p>
        ${patterns.length ? patterns.map((item) => `
          <article class="learning-card">
            <strong>${escapeHtml(item.pattern)}</strong>
            <p>${escapeHtml(item.explanationVi || "")}</p>
            <small>${escapeHtml(item.example || "")}</small>
          </article>
        `).join("") : '<p class="muted-copy">No patterns generated.</p>'}
      </div>
    `;
  }

  function renderJournal() {
    const journal = lesson.journal || {};
    return `
      <form class="lesson-journal-form" data-journal-form>
        <label>
          <span>Why I saved this</span>
          <textarea name="whyISavedThis" rows="3">${escapeHtml(journal.whyISavedThis || "")}</textarea>
        </label>
        <label>
          <span>My thought</span>
          <textarea name="myThought" rows="4" placeholder="What did this idea make you think about?">${escapeHtml(journal.myThought || "")}</textarea>
        </label>
        <label>
          <span>Favorite phrase</span>
          <textarea name="favoritePhrase" rows="2" placeholder="One phrase worth remembering">${escapeHtml(journal.favoritePhrase || "")}</textarea>
        </label>
        <label>
          <span>My example</span>
          <textarea name="myExample" rows="3" placeholder="Rewrite the pattern using your own work or life">${escapeHtml(journal.myExample || "")}</textarea>
        </label>
        <div class="journal-actions">
          <span data-journal-status></span>
          <button class="primary-action" type="submit">Save journal</button>
        </div>
      </form>
    `;
  }

  function mediaMarkup() {
    const urls = lesson.mediaUrls || {};
    if (urls.video) {
      return `
        <video
          class="lesson-media"
          data-lesson-media
          controls
          playsinline
          preload="metadata"
          ${urls.poster ? `poster="${escapeHtml(urls.poster)}"` : ""}
          src="${escapeHtml(urls.video)}"
        ></video>
      `;
    }

    if (urls.audio) {
      return `
        <div class="audio-stage">
          ${urls.poster ? `<img src="${escapeHtml(urls.poster)}" alt="Lesson poster" />` : ""}
          <audio class="lesson-audio" data-lesson-media controls preload="metadata" src="${escapeHtml(urls.audio)}"></audio>
        </div>
      `;
    }

    return '<div class="lesson-empty-panel"><p>No playable media is available.</p></div>';
  }

  function renderListeningNotes() {
    const allNotes = lesson.notes || [];
    const hiddenCount = allNotes.filter((note) => note.isHidden).length;
    const visibleNotes = allNotes.filter((note) => showHiddenNotes || !note.isHidden);
    const editingNote = allNotes.find((note) => note.id === editingNoteId) || null;
    const quickTitle = editingNote ? editingNote.title : todayDateTitle();
    const quickContent = editingNote ? editingNote.content : "";
    const submitLabel = editingNote ? "Save note" : "Add note";
    const noteCards = visibleNotes.length ? visibleNotes.map((note) => `
      <details class="lesson-note-card${note.isHidden ? " is-hidden" : ""}" data-note-id="${escapeHtml(note.id)}" open>
        <summary>
          <span class="lesson-note-title" data-note-edit title="Double click to edit">${escapeHtml(note.title || noteDateLabel(note.createdAt))}</span>
          <span class="lesson-note-summary-actions">
            <button class="lesson-note-icon-action" type="button" title="Delete note" aria-label="Delete note" data-note-delete>
              ${iconSvg("trash")}
            </button>
            <button
              class="lesson-note-icon-action"
              type="button"
              title="${note.isHidden ? "Restore note" : "Mark done and hide note"}"
              aria-label="${note.isHidden ? "Restore note" : "Mark done and hide note"}"
              data-note-visibility="${note.isHidden ? "show" : "hide"}"
            >
              ${iconSvg(note.isHidden ? "restore" : "check")}
            </button>
          </span>
        </summary>
        <p>${escapeHtml(note.content)}</p>
      </details>
    `).join("") : `
      <div class="lesson-note-empty">
        <strong>${showHiddenNotes ? "No notes yet" : "No visible notes"}</strong>
        <span>${hiddenCount && !showHiddenNotes ? "Turn on hidden notes to review archived notes." : "Add a note while listening and it will appear here."}</span>
      </div>
    `;

    return `
      <section class="listening-notes-panel" data-notes-view>
        <form class="listening-notes" data-listening-notes-form>
          <div>
            <p class="eyebrow">${editingNote ? "Edit note" : "Quick notes"}</p>
            <input name="title" type="text" value="${escapeHtml(quickTitle)}" placeholder="yyyy-mm-dd" />
            <textarea name="content" rows="4" placeholder="Add a note while listening...">${escapeHtml(quickContent)}</textarea>
          </div>
          <div class="listening-notes-actions">
            <span data-listening-notes-status></span>
            <div class="listening-notes-buttons">
              ${editingNote ? '<button class="secondary-action" type="button" data-note-edit-cancel>Cancel</button>' : ""}
              <button class="secondary-action" type="submit">${submitLabel}</button>
            </div>
          </div>
        </form>

        <aside class="lesson-notes-list">
          <div class="lesson-notes-header">
            <div>
              <p class="eyebrow">Notes</p>
              <strong>${visibleNotes.length} shown</strong>
            </div>
            <label class="note-hidden-switch">
              <input type="checkbox" data-show-hidden-notes ${showHiddenNotes ? "checked" : ""} />
              <span>Show hidden${hiddenCount ? ` (${hiddenCount})` : ""}</span>
            </label>
          </div>
          <div class="lesson-note-stack">${noteCards}</div>
        </aside>
      </section>
    `;
  }

  function renderNotesView() {
    const view = root.querySelector("[data-notes-view]");
    if (!view) return;
    view.outerHTML = renderListeningNotes();
    bindLessonNoteEvents();
  }

  function startEditingNote(noteId) {
    editingNoteId = noteId;
    renderNotesView();
    root.querySelector("[data-listening-notes-form] textarea[name='content']")?.focus();
  }

  function bindLessonNoteEvents() {
    root.querySelector("[data-listening-notes-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const titleInput = form.querySelector("input[name='title']");
      const textarea = form.querySelector("textarea[name='content']");
      const status = form.querySelector("[data-listening-notes-status]");
      const submit = form.querySelector("button[type='submit']");
      const title = titleInput?.value || "";
      const content = textarea?.value || "";

      if (!title.trim()) {
        if (status) status.textContent = "Add a title";
        titleInput?.focus();
        return;
      }

      if (!content.trim()) {
        if (status) status.textContent = "Write a note first";
        textarea?.focus();
        return;
      }

      if (submit) submit.disabled = true;
      if (status) status.textContent = editingNoteId ? "Saving..." : "Adding...";
      try {
        if (editingNoteId) {
          const updated = await updateLessonNote(lesson.lesson.id, editingNoteId, { title, content });
          lesson.notes = (lesson.notes || []).map((note) => note.id === editingNoteId ? updated : note);
          editingNoteId = null;
        } else {
          const note = await createLessonNote(lesson.lesson.id, { title, content });
          lesson.notes = [note, ...(lesson.notes || [])];
        }
        renderNotesView();
      } catch (error) {
        if (status) status.textContent = error.message;
        else window.alert(error.message);
      } finally {
        if (submit) submit.disabled = false;
      }
    });

    root.querySelector("[data-note-edit-cancel]")?.addEventListener("click", () => {
      editingNoteId = null;
      renderNotesView();
    });

    root.querySelector("[data-show-hidden-notes]")?.addEventListener("change", (event) => {
      showHiddenNotes = event.currentTarget.checked;
      renderNotesView();
    });

    for (const editTarget of root.querySelectorAll("[data-note-edit]")) {
      editTarget.addEventListener("dblclick", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const noteId = event.currentTarget.closest("[data-note-id]")?.dataset.noteId;
        if (noteId) startEditingNote(noteId);
      });
    }

    for (const button of root.querySelectorAll("[data-note-delete]")) {
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const noteId = event.currentTarget.closest("[data-note-id]")?.dataset.noteId;
        if (!noteId) return;
        if (!window.confirm("Delete this note?")) return;
        event.currentTarget.disabled = true;

        try {
          await deleteLessonNote(lesson.lesson.id, noteId);
          lesson.notes = (lesson.notes || []).filter((note) => note.id !== noteId);
          if (editingNoteId === noteId) editingNoteId = null;
          renderNotesView();
        } catch (error) {
          window.alert(error.message);
          event.currentTarget.disabled = false;
        }
      });
    }

    for (const button of root.querySelectorAll("[data-note-visibility]")) {
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const noteCard = event.currentTarget.closest("[data-note-id]");
        const noteId = noteCard?.dataset.noteId;
        if (!noteId) return;
        const isHidden = event.currentTarget.dataset.noteVisibility === "hide";
        event.currentTarget.disabled = true;

        try {
          const updated = await updateLessonNote(lesson.lesson.id, noteId, { isHidden });
          lesson.notes = (lesson.notes || []).map((note) => note.id === noteId ? updated : note);
          if (isHidden && editingNoteId === noteId) editingNoteId = null;
          renderNotesView();
        } catch (error) {
          window.alert(error.message);
          event.currentTarget.disabled = false;
        }
      });
    }
  }

  function render() {
    const meta = lesson.lesson || {};
    const learning = lesson.learning || {};

    root.innerHTML = `
      <div class="lesson-page-header">
        <div class="lesson-header-main">
          <div class="lesson-title-block">
            <h1>${escapeHtml(meta.title || "Lesson")}</h1>
            <p>${escapeHtml(learning.summaryVi || "")}</p>
          </div>
          <div class="lesson-header-actions">
            <button class="lesson-icon-action favorite-action" type="button" data-favorite-toggle aria-pressed="false"></button>
            <button class="lesson-icon-action mastered-action" type="button" data-progress-toggle aria-pressed="false"></button>
          </div>
        </div>
      </div>

      <div class="learning-player-grid">
        <section class="media-column">
          <div class="media-frame">${mediaMarkup()}</div>
          <div class="player-tools">
            <div class="player-tool-group">
              <button type="button" data-prev-segment>← Previous</button>
              <button type="button" data-next-segment>Next →</button>
              <button type="button" data-loop-toggle>Loop ×3</button>
            </div>
            <div class="player-tool-group" aria-label="Playback speed">
              <button type="button" data-speed="0.75">0.75×</button>
              <button class="is-active" type="button" data-speed="1">1×</button>
              <button type="button" data-speed="1.25">1.25×</button>
            </div>
          </div>
          <p class="player-hint">Choose a sentence, then use Loop ×3 for focused listening and shadowing.</p>
          ${renderListeningNotes()}
        </section>

        <section class="learning-column">
          <div class="lesson-tabs" role="tablist">
            <button class="is-active" type="button" data-lesson-tab="listen">Listen</button>
            <button type="button" data-lesson-tab="meaning">Meaning</button>
            <button type="button" data-lesson-tab="phrases">Phrases</button>
            <button type="button" data-lesson-tab="journal">Journal</button>
          </div>

          <div class="lesson-panel transcript-panel" data-lesson-panel="listen">
            ${renderTranscript()}
          </div>
          <div class="lesson-panel meaning-panel" data-lesson-panel="meaning" hidden>
            ${renderMeaning()}
          </div>
          <div class="lesson-panel phrases-panel" data-lesson-panel="phrases" hidden>
            ${renderPhrases()}
          </div>
          <div class="lesson-panel journal-panel" data-lesson-panel="journal" hidden>
            ${renderJournal()}
          </div>
        </section>
      </div>
    `;

    media = root.querySelector("[data-lesson-media]");
    renderProgress();
    bindEvents();
  }

  function bindEvents() {
    for (const button of root.querySelectorAll("[data-lesson-tab]")) {
      button.addEventListener("click", () => switchTab(button.dataset.lessonTab));
    }

    for (const line of root.querySelectorAll("[data-segment-id]")) {
      line.addEventListener("click", () => {
        setSelectedSegment(line.dataset.segmentId, { seek: true, play: true });
      });
    }

    for (const button of root.querySelectorAll("[data-speed]")) {
      button.addEventListener("click", () => {
        if (!media) return;
        media.playbackRate = Number(button.dataset.speed);
        for (const item of root.querySelectorAll("[data-speed]")) {
          item.classList.toggle("is-active", item === button);
        }
        emitPlayerState({ force: true });
      });
    }

    root.querySelector("[data-prev-segment]")?.addEventListener("click", () => {
      const currentId = selectedSegmentId || currentSegment()?.id || segments()[0]?.id;
      const index = Math.max(0, segmentIndex(currentId) - 1);
      const target = segments()[index];
      if (target) setSelectedSegment(target.id, { seek: true, play: true });
    });

    root.querySelector("[data-next-segment]")?.addEventListener("click", () => {
      const currentId = selectedSegmentId || currentSegment()?.id || segments()[0]?.id;
      const index = Math.min(segments().length - 1, segmentIndex(currentId) + 1);
      const target = segments()[index];
      if (target) setSelectedSegment(target.id, { seek: true, play: true });
    });

    root.querySelector("[data-loop-toggle]")?.addEventListener("click", () => {
      if (loopEnabled) stopLoop();
      else startLoop();
    });

    root.querySelector("[data-progress-toggle]")?.addEventListener("click", async () => {
      const action = lesson.progress?.status === "MASTERED" ? "MARK_LEARNING" : "MARK_MASTERED";
      try {
        lesson.progress = await updateLessonProgress(lesson.lesson.id, action);
        renderProgress();
      } catch (error) {
        window.alert(error.message);
      }
    });

    root.querySelector("[data-favorite-toggle]")?.addEventListener("click", async () => {
      try {
        lesson.progress = await updateLessonProgress(lesson.lesson.id, "TOGGLE_FAVORITE");
        renderProgress();
      } catch (error) {
        window.alert(error.message);
      }
    });

    root.querySelector("[data-journal-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const status = form.querySelector("[data-journal-status]");
      const submit = form.querySelector("button[type='submit']");
      const data = new FormData(form);

      await saveJournalPatch({
        whyISavedThis: data.get("whyISavedThis"),
        myThought: data.get("myThought"),
        favoritePhrase: data.get("favoritePhrase"),
        myExample: data.get("myExample")
      }, { status, submit });
    });

    bindLessonNoteEvents();

    if (media) {
      media.addEventListener("timeupdate", onTimeUpdate);
      media.addEventListener("seeking", () => {
        if (loopEnabled && !loopGuard) loopCount = 0;
      });
      media.addEventListener("ended", () => {
        stopLoop();
        void updateLessonProgress(lesson.lesson.id, "LISTEN_COMPLETED")
          .then((progress) => {
            lesson.progress = progress;
            renderProgress();
          })
          .catch(() => {});
      });
    }

    const first = segments()[0];
    if (first) setSelectedSegment(first.id);
  }

  async function saveJournalPatch(payload, { status, submit } = {}) {
    if (submit) submit.disabled = true;
    if (status) status.textContent = "Saving...";
    try {
      lesson.journal = await updateLessonJournal(lesson.lesson.id, {
        ...(lesson.journal || {}),
        ...payload
      });

      const journalThought = root.querySelector("[data-journal-form] textarea[name='myThought']");
      if (journalThought && journalThought.value !== (lesson.journal.myThought || "")) {
        journalThought.value = lesson.journal.myThought || "";
      }

      if (status) {
        status.textContent = "Saved";
        window.setTimeout(() => {
          if (status.textContent === "Saved") status.textContent = "";
        }, 1200);
      }
    } catch (error) {
      if (status) status.textContent = error.message;
      else window.alert(error.message);
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  function restorePlayerState(state = {}) {
    switchTab(state.activeTab || "listen");

    if (state.selectedSegmentId && segmentById(state.selectedSegmentId)) {
      setSelectedSegment(state.selectedSegmentId);
    }

    if (!media) return;
    const rate = [0.75, 1, 1.25].includes(Number(state.playbackRate))
      ? Number(state.playbackRate)
      : 1;
    media.playbackRate = rate;
    for (const item of root.querySelectorAll("[data-speed]")) {
      item.classList.toggle("is-active", Number(item.dataset.speed) === rate);
    }

    const savedTime = Math.max(0, Number(state.currentTimeSeconds || 0));
    const applySavedTime = () => {
      const maxTime = Number.isFinite(media.duration) ? Math.max(0, media.duration - 0.05) : savedTime;
      media.currentTime = Math.min(savedTime, maxTime);
      setActiveSegment(currentSegment()?.id || null);
      emitPlayerState({ force: true });
    };

    if (media.readyState >= 1) applySavedTime();
    else media.addEventListener("loadedmetadata", applySavedTime, { once: true });
  }

  async function open(lessonId, playerState = {}) {
    resetRuntime();
    root.innerHTML = '<div class="empty-card"><p>Loading lesson…</p></div>';
    lesson = await getLessonDetail(lessonId);
    render();
    restorePlayerState(playerState);

    try {
      lesson.progress = await updateLessonProgress(lessonId, "OPENED");
      renderProgress();
    } catch {
      // Opening the learning surface should still work if progress persistence fails.
    }
  }

  return { open, reset: resetRuntime };
}

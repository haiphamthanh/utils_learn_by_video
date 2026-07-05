import {
  getLessonDetail,
  updateLessonJournal,
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

function progressLabel(status) {
  return {
    NEW: "New",
    LEARNING: "Learning",
    MASTERED: "Mastered"
  }[status] || status;
}

export function createLessonPlayer({ root, onClose }) {
  let lesson = null;
  let media = null;
  let selectedSegmentId = null;
  let activeSegmentId = null;
  let loopEnabled = false;
  let loopCount = 0;
  let loopGuard = false;
  let loopTimer = null;

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
    loopEnabled = false;
    loopCount = 0;
    loopGuard = false;
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
    const node = root.querySelector("[data-progress-summary]");
    const toggle = root.querySelector("[data-progress-toggle]");
    if (!node || !toggle || !lesson) return;

    const progress = lesson.progress || {};
    node.textContent = `${progressLabel(progress.status)} · ${progress.listenCount || 0} listens · ${progress.shadowCount || 0} loops`;
    toggle.textContent = progress.status === "MASTERED" ? "Continue learning" : "Mark mastered";
  }

  function switchTab(tabName) {
    for (const button of root.querySelectorAll("[data-lesson-tab]")) {
      button.classList.toggle("is-active", button.dataset.lessonTab === tabName);
    }
    for (const panel of root.querySelectorAll("[data-lesson-panel]")) {
      panel.hidden = panel.dataset.lessonPanel !== tabName;
    }
  }

  function renderTranscript() {
    return segments().map((segment) => `
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

  function render() {
    const meta = lesson.lesson || {};
    const learning = lesson.learning || {};

    root.innerHTML = `
      <div class="lesson-page-header">
        <button class="back-action" type="button" data-close-lesson>← Back</button>
        <div class="lesson-title-block">
          <p class="eyebrow">${escapeHtml(meta.topic || "Personal lesson")}</p>
          <h1>${escapeHtml(meta.title || "Lesson")}</h1>
          <p>${escapeHtml(learning.summaryVi || "")}</p>
        </div>
        <div class="lesson-progress-box">
          <span data-progress-summary></span>
          <button class="secondary-action" type="button" data-progress-toggle></button>
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
    root.querySelector("[data-close-lesson]")?.addEventListener("click", () => {
      media?.pause();
      stopLoop();
      onClose();
    });

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

    root.querySelector("[data-journal-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const status = form.querySelector("[data-journal-status]");
      const submit = form.querySelector("button[type='submit']");
      const data = new FormData(form);

      submit.disabled = true;
      status.textContent = "Saving…";
      try {
        lesson.journal = await updateLessonJournal(lesson.lesson.id, {
          whyISavedThis: data.get("whyISavedThis"),
          myThought: data.get("myThought"),
          favoritePhrase: data.get("favoritePhrase"),
          myExample: data.get("myExample")
        });
        status.textContent = "Saved";
        window.setTimeout(() => {
          status.textContent = "";
        }, 1200);
      } catch (error) {
        status.textContent = error.message;
      } finally {
        submit.disabled = false;
      }
    });

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

  async function open(lessonId) {
    resetRuntime();
    root.innerHTML = '<div class="empty-card"><p>Loading lesson…</p></div>';
    lesson = await getLessonDetail(lessonId);
    render();

    try {
      lesson.progress = await updateLessonProgress(lessonId, "OPENED");
      renderProgress();
    } catch {
      // Opening the learning surface should still work if progress persistence fails.
    }
  }

  return { open, reset: resetRuntime };
}

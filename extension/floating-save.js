(function () {
  const ROOT_ID = "enjoy-journal-floating-save";
  let lastUrl = "";
  let refreshTimer = null;

  function readCapture() {
    return window.EnjoyJournalCaptureProviders?.readCurrentCapture?.() || null;
  }

  function removeRoot() {
    document.getElementById(ROOT_ID)?.remove();
  }

  function setStatus(root, text, kind) {
    const status = root.querySelector("[data-ej-status]");
    if (!status) return;
    status.textContent = text || "";
    status.dataset.kind = kind || "";
  }

  function render() {
    const capture = readCapture();
    if (!capture) {
      removeRoot();
      return;
    }

    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement("div");
      root.id = ROOT_ID;
      root.innerHTML = `
        <style>
          #${ROOT_ID} {
            position: fixed;
            right: 18px;
            bottom: 18px;
            z-index: 2147483647;
            width: min(330px, calc(100vw - 32px));
            font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            color: #201f1d;
          }

          #${ROOT_ID} * {
            box-sizing: border-box;
          }

          #${ROOT_ID} .ej-panel {
            display: grid;
            gap: 10px;
            padding: 14px;
            border: 1px solid rgb(255 255 255 / 62%);
            border-radius: 14px;
            background: rgb(255 253 248 / 96%);
            box-shadow: 0 18px 60px rgb(0 0 0 / 24%);
            backdrop-filter: blur(14px);
          }

          #${ROOT_ID} .ej-top {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 10px;
            align-items: center;
          }

          #${ROOT_ID} .ej-label {
            margin: 0 0 4px;
            color: #1f5b49;
            font-size: 11px;
            font-weight: 800;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }

          #${ROOT_ID} .ej-title {
            margin: 0;
            overflow: hidden;
            color: #201f1d;
            font-size: 14px;
            font-weight: 800;
            line-height: 1.35;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          #${ROOT_ID} .ej-toggle,
          #${ROOT_ID} .ej-save {
            border: 0;
            border-radius: 999px;
            font: inherit;
            font-weight: 800;
            cursor: pointer;
          }

          #${ROOT_ID} .ej-toggle {
            width: 36px;
            height: 36px;
            background: #dcece5;
            color: #174637;
          }

          #${ROOT_ID} .ej-body[hidden] {
            display: none;
          }

          #${ROOT_ID} textarea {
            width: 100%;
            min-height: 76px;
            resize: vertical;
            border: 1px solid #ddd6ca;
            border-radius: 10px;
            padding: 10px 11px;
            background: #ffffff;
            color: #201f1d;
            font: inherit;
            font-size: 13px;
            line-height: 1.45;
          }

          #${ROOT_ID} .ej-actions {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
          }

          #${ROOT_ID} .ej-status {
            min-width: 0;
            color: #6f6a61;
            font-size: 12px;
            line-height: 1.35;
          }

          #${ROOT_ID} .ej-status[data-kind="error"] {
            color: #8a2d2d;
          }

          #${ROOT_ID} .ej-status[data-kind="success"] {
            color: #1f5b49;
            font-weight: 800;
          }

          #${ROOT_ID} .ej-save {
            flex: 0 0 auto;
            padding: 10px 14px;
            background: #1f5b49;
            color: #fff;
          }

          #${ROOT_ID} .ej-save:disabled {
            cursor: wait;
            opacity: 0.68;
          }
        </style>
        <div class="ej-panel">
          <div class="ej-top">
            <div>
              <p class="ej-label" data-ej-label></p>
              <p class="ej-title" data-ej-title></p>
            </div>
            <button class="ej-toggle" type="button" data-ej-toggle aria-label="Toggle save panel">EJ</button>
          </div>
          <div class="ej-body" data-ej-body hidden>
            <textarea data-ej-note placeholder="Why save this?"></textarea>
            <div class="ej-actions">
              <span class="ej-status" data-ej-status></span>
              <button class="ej-save" type="button" data-ej-save>Save</button>
            </div>
          </div>
        </div>
      `;
      document.documentElement.append(root);

      root.querySelector("[data-ej-toggle]").addEventListener("click", () => {
        const body = root.querySelector("[data-ej-body]");
        body.hidden = !body.hidden;
        if (!body.hidden) root.querySelector("[data-ej-note]")?.focus();
      });

      root.querySelector("[data-ej-save]").addEventListener("click", () => save(root));
    }

    root.querySelector("[data-ej-label]").textContent = capture.label;
    root.querySelector("[data-ej-title]").textContent = capture.title;
  }

  async function save(root) {
    const capture = readCapture();
    if (!capture) return;

    const button = root.querySelector("[data-ej-save]");
    const note = root.querySelector("[data-ej-note]");
    button.disabled = true;
    button.textContent = "Saving...";
    setStatus(root, "", "");

    chrome.runtime.sendMessage({
      type: "SAVE_CAPTURE",
      capture: {
        sourceType: capture.sourceType,
        platform: capture.platform,
        url: capture.url,
        title: capture.title,
        personalNote: note.value
      }
    }, (response) => {
      button.disabled = false;
      button.textContent = "Save";

      if (chrome.runtime.lastError || !response?.ok) {
        setStatus(root, response?.error?.message || chrome.runtime.lastError?.message || "Could not save.", "error");
        return;
      }

      note.value = "";
      setStatus(root, "Saved and analyzing.", "success");
      window.setTimeout(() => setStatus(root, "", ""), 1800);
    });
  }

  function scheduleRender() {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(render, 250);
  }

  function watchUrl() {
    window.setInterval(() => {
      if (lastUrl === location.href) return;
      lastUrl = location.href;
      scheduleRender();
    }, 700);
  }

  lastUrl = location.href;
  render();
  watchUrl();
  new MutationObserver(scheduleRender).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();

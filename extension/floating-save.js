(function () {
  const ROOT_ID = "enjoy-journal-floating-save";
  let lastUrl = "";
  let refreshTimer = null;
  let lastCapture = null;

  function readCapture() {
    const capture = window.EnjoyJournalCaptureProviders?.readCurrentCapture?.() || null;
    if (capture) lastCapture = capture;
    if (!/\/reel\//i.test(location.pathname)) lastCapture = null;
    return capture || lastCapture;
  }

  function removeRoot() {
    document.getElementById(ROOT_ID)?.remove();
  }

  function setStatus(root, text, kind) {
    const el = root.querySelector("[data-ej-status]");
    if (!el) return;
    el.textContent = text || "";
    el.dataset.kind = kind || "";
  }

  function togglePopover(root) {
    const popover = root.querySelector("[data-ej-popover]");
    const btn = root.querySelector("[data-ej-btn]");
    if (popover.dataset.visible === "true") {
      popover.dataset.visible = "false";
      return;
    }

    const btnRect = btn.getBoundingClientRect();
    const pw = 280;
    let left = btnRect.left - pw - 10;
    let top = btnRect.top;

    if (left < 10) {
      left = btnRect.right + 10;
    }
    if (left + pw > window.innerWidth - 8) {
      left = window.innerWidth - pw - 8;
    }
    if (top < 8) top = 8;
    if (top > window.innerHeight - 220) {
      top = window.innerHeight - 220;
    }

    popover.style.top = top + "px";
    popover.style.left = left + "px";
    popover.dataset.visible = "true";
    root.querySelector("[data-ej-note]")?.focus();

    chrome.runtime.sendMessage({ type: "GET_SAVE_AVAILABILITY" }, (response) => {
      if (chrome.runtime.lastError || !response?.ok) return;
      setStatus(
        root,
        response.data?.available ? "" : "Đang có video được xử lý, xin chờ chốc lát.",
        response.data?.available ? "" : "error"
      );
    });
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
            z-index: 2147483647;
            font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            color: #2c2a27;
          }
          #${ROOT_ID} * { box-sizing: border-box; }

          #${ROOT_ID} .ej-btn {
            position: fixed;
            width: 44px;
            height: 44px;
            border: 1.5px solid rgb(255 255 255 / 72%);
            border-radius: 50%;
            background: rgb(31 91 73 / 88%);
            color: #fff;
            font-size: 18px;
            font-weight: 800;
            line-height: 1;
            cursor: pointer;
            box-shadow: 0 4px 18px rgb(0 0 0 / 30%);
            backdrop-filter: blur(10px);
            display: flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
          }
          #${ROOT_ID} .ej-btn:hover {
            transform: scale(1.09);
            background: rgb(31 91 73 / 96%);
            box-shadow: 0 6px 24px rgb(0 0 0 / 36%);
          }
          #${ROOT_ID} .ej-btn svg {
            width: 20px;
            height: 20px;
            display: block;
            fill: none;
            stroke: #fff;
            stroke-width: 2;
            stroke-linecap: round;
            stroke-linejoin: round;
          }

          #${ROOT_ID} .ej-popover {
            position: fixed;
            width: 280px;
            padding: 14px;
            border: 1px solid rgb(255 255 255 / 70%);
            border-radius: 14px;
            background: rgb(247 246 241 / 97%);
            box-shadow: 0 14px 48px rgb(0 0 0 / 26%);
            backdrop-filter: blur(14px);
            display: none;
          }
          #${ROOT_ID} .ej-popover[data-visible="true"] { display: block; }

          #${ROOT_ID} .ej-popover-label {
            margin: 0 0 8px;
            color: #1f5b49;
            font-size: 11px;
            font-weight: 800;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }
          #${ROOT_ID} .ej-popover textarea {
            width: 100%;
            min-height: 76px;
            resize: vertical;
            border: 1px solid #e3dfd5;
            border-radius: 10px;
            padding: 10px 11px;
            background: #fff;
            color: #2c2a27;
            font: inherit;
            font-size: 13px;
            line-height: 1.45;
            margin-bottom: 10px;
          }
          #${ROOT_ID} .ej-popover select {
            width: 100%;
            border: 1px solid #e3dfd5;
            border-radius: 10px;
            padding: 9px 10px;
            background: #fff;
            color: #2c2a27;
            font: inherit;
            font-size: 13px;
            margin-bottom: 10px;
          }
          #${ROOT_ID} .ej-popover textarea:focus {
            outline: none;
            border-color: #1f5b49;
            box-shadow: 0 0 0 3px rgb(31 91 73 / 14%);
          }
          #${ROOT_ID} .ej-popover-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
          }
          #${ROOT_ID} .ej-popover-status {
            min-width: 0;
            color: #79756d;
            font-size: 12px;
            line-height: 1.35;
          }
          #${ROOT_ID} .ej-popover-status[data-kind="error"] { color: #8a2d2d; }
          #${ROOT_ID} .ej-popover-status[data-kind="success"] { color: #1f5b49; font-weight: 800; }

          #${ROOT_ID} .ej-popover-save {
            flex: 0 0 auto;
            padding: 8px 16px;
            border: 0;
            border-radius: 999px;
            background: #1f5b49;
            color: #fff;
            font: inherit;
            font-size: 13px;
            font-weight: 800;
            cursor: pointer;
            transition: opacity 0.15s;
          }
          #${ROOT_ID} .ej-popover-save:disabled { cursor: wait; opacity: 0.68; }
        </style>
        <button class="ej-btn" data-ej-btn aria-label="Save to Enjoy Journal">
          <svg viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        </button>
        <div class="ej-popover" data-ej-popover>
          <p class="ej-popover-label">Save this moment</p>
          <select data-ej-language aria-label="Video language" required>
            <option value="en">English</option>
            <option value="ja">日本語 (Japanese)</option>
            <option value="zh">中文 (Chinese)</option>
          </select>
          <textarea data-ej-note placeholder="Why save this?"></textarea>
          <div class="ej-popover-row">
            <span class="ej-popover-status" data-ej-status></span>
            <button class="ej-popover-save" type="button" data-ej-save>Save</button>
          </div>
        </div>
      `;
      document.documentElement.append(root);

      root.querySelector("[data-ej-btn]").addEventListener("click", (e) => {
        e.stopPropagation();
        togglePopover(root);
      });
      root.querySelector("[data-ej-save]").addEventListener("click", (e) => {
        e.stopPropagation();
        save(root);
      });

      document.addEventListener("click", (e) => {
        const popover = root.querySelector("[data-ej-popover]");
        if (popover.dataset.visible !== "true") return;
        if (!root.contains(e.target)) {
          popover.dataset.visible = "false";
        }
      }, true);
    }

    const btn = root.querySelector("[data-ej-btn]");
    btn.style.top = "72px";
    btn.style.right = "20px";
    btn.style.left = "auto";
    btn.style.display = "flex";
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
        language: root.querySelector("[data-ej-language]").value,
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
      window.setTimeout(() => {
        setStatus(root, "", "");
        root.querySelector("[data-ej-popover]").dataset.visible = "false";
      }, 1600);
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
  watchUrl();
  render();
  new MutationObserver(scheduleRender).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();

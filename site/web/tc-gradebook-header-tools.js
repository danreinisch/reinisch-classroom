(() => {
  "use strict";

  if (!location.pathname.startsWith("/teacher/gradebook")) return;

  const STYLE_ID = "gbHeaderToolsStyles";
  const ENHANCED_FLAG = "gbHeaderToolsEnhanced";
  const COPY_RESET_MS = 1200;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      table.gb-table th.gb-assignment-header-tools {
        white-space: normal !important;
        vertical-align: top;
      }

      .gb-tablewrap:not(.gb-compact) table.gb-table th.gb-assignment-header-tools {
        min-width: 180px !important;
      }

      .gb-tablewrap.gb-compact table.gb-table th.gb-assignment-header-tools {
        min-width: 132px !important;
      }

      .gb-assignment-header-row {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        min-width: 0;
      }

      .gb-assignment-header-row .gb-col-title {
        flex: 1 1 auto;
        min-width: 0;
        line-height: 1.25;
        white-space: normal;
        overflow-wrap: anywhere;
        user-select: text;
      }

      .gb-header-copy-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        width: 25px;
        height: 25px;
        padding: 0;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 7px;
        background: rgba(255, 255, 255, 0.06);
        color: inherit;
        font: inherit;
        font-size: 14px;
        line-height: 1;
        cursor: pointer;
        opacity: 0.72;
        text-transform: none;
      }

      .gb-header-copy-btn:hover {
        opacity: 1;
        background: rgba(34, 197, 94, 0.12);
        border-color: rgba(34, 197, 94, 0.45);
      }

      .gb-header-copy-btn:focus-visible {
        outline: 2px solid rgba(59, 130, 246, 0.85);
        outline-offset: 2px;
        opacity: 1;
      }

      .gb-header-copy-btn[data-copy-state="success"] {
        color: rgba(74, 222, 128, 1);
        opacity: 1;
      }

      .gb-header-copy-btn[data-copy-state="error"] {
        color: rgba(248, 113, 113, 1);
        opacity: 1;
      }
    `;

    document.head.appendChild(style);
  }

  function announce(message) {
    const status = document.getElementById("gbA11yStatus");
    if (!status) return;

    status.textContent = "";
    window.setTimeout(() => {
      status.textContent = message;
    }, 20);
  }

  async function copyTextToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";

    document.body.appendChild(textarea);
    textarea.select();

    const copied = document.execCommand("copy");
    textarea.remove();

    if (!copied) {
      throw new Error("Clipboard copy failed.");
    }
  }

  function decorateTitle(titleEl) {
    if (!titleEl || titleEl.dataset[ENHANCED_FLAG] === "1") return;

    const th = titleEl.closest("th");
    if (!th) return;

    const fullTitle = String(titleEl.getAttribute("title") || "").trim();
    if (!fullTitle) return;

    titleEl.dataset[ENHANCED_FLAG] = "1";
    th.classList.add("gb-assignment-header-tools");

    const currentText = titleEl.textContent || "";
    const sortMatch = currentText.match(/\s[▲▼]$/);
    const sortSuffix = sortMatch ? sortMatch[0] : "";
    titleEl.textContent = fullTitle + sortSuffix;

    const row = document.createElement("div");
    row.className = "gb-assignment-header-row";
    th.insertBefore(row, titleEl);
    row.appendChild(titleEl);

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "gb-header-copy-btn";
    copyButton.textContent = "⧉";
    copyButton.title = "Copy full assignment title";
    copyButton.setAttribute("aria-label", `Copy assignment title: ${fullTitle}`);

    copyButton.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });

    copyButton.addEventListener("mousedown", (event) => {
      event.stopPropagation();
    });

    copyButton.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const originalLabel = copyButton.getAttribute("aria-label");

      try {
        await copyTextToClipboard(fullTitle);
        copyButton.textContent = "✓";
        copyButton.dataset.copyState = "success";
        copyButton.setAttribute("aria-label", `Copied assignment title: ${fullTitle}`);
        announce(`Copied assignment title: ${fullTitle}`);
      } catch (error) {
        console.warn("[gradebook-header-tools] Copy failed:", error);
        copyButton.textContent = "!";
        copyButton.dataset.copyState = "error";
        copyButton.setAttribute("aria-label", "Assignment title could not be copied");
        announce("Assignment title could not be copied.");
      }

      window.setTimeout(() => {
        copyButton.textContent = "⧉";
        delete copyButton.dataset.copyState;
        copyButton.setAttribute("aria-label", originalLabel || `Copy assignment title: ${fullTitle}`);
      }, COPY_RESET_MS);
    });

    row.appendChild(copyButton);
  }

  function decorateHeaders(root) {
    root.querySelectorAll(".gb-col-title").forEach(decorateTitle);
  }

  function init() {
    injectStyles();

    const tableHead = document.getElementById("gbTableHead");
    if (!tableHead) return;

    decorateHeaders(tableHead);

    const observer = new MutationObserver(() => {
      decorateHeaders(tableHead);
    });

    observer.observe(tableHead, {
      childList: true,
      subtree: true,
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();

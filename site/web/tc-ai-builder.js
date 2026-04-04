/**
 * tc-ai-builder.js
 * Teacher Center AI Builder page — generate assignments and presentations using Claude.
 */

(function () {
  "use strict";

  // Page guard - only run on ai-builder page
  if (!location.pathname.startsWith("/teacher/ai-builder")) return;

  // ── In-memory state ──────────────────────────────────────────────────────────

  /** @type {'assignments'|'presentations'|'both'} */
  let currentTaskType = "assignments";

  /** @type {Array<{name: string, dataURL: string}>} */
  const uploadedImages = [];

  // ── DOM helpers ──────────────────────────────────────────────────────────────

  function $(id) { return document.getElementById(id); }

  function showStatus(msg, type) {
    const el = $("aiStatus");
    el.textContent = msg;
    el.className = "ai-status " + (type || "error");
  }

  function clearStatus() {
    const el = $("aiStatus");
    el.textContent = "";
    el.className = "ai-status";
  }

  function setProgress(visible, msg) {
    const el = $("aiProgress");
    if (visible) {
      el.classList.add("visible");
      if (msg) $("aiProgressMsg").textContent = msg;
    } else {
      el.classList.remove("visible");
    }
  }

  // ── Task type toggling ───────────────────────────────────────────────────────

  function selectTaskType(type) {
    currentTaskType = type;
    ["assignments", "presentations", "both"].forEach(function (t) {
      const btn = $("aiType" + t.charAt(0).toUpperCase() + t.slice(1));
      if (btn) btn.classList.toggle("active", t === type);
    });

    const showImages = type === "presentations" || type === "both";
    const imgSection = $("aiImageSection");
    if (imgSection) imgSection.style.display = showImages ? "" : "none";
  }

  // ── Source file reading ──────────────────────────────────────────────────────

  function readSourceFile(file) {
    return new Promise(function (resolve) {
      if (file.type === "text/plain" || file.name.endsWith(".txt")) {
        const reader = new FileReader();
        reader.onload = function (e) { resolve({ text: e.target.result, filename: file.name }); };
        reader.onerror = function () { resolve({ text: "", filename: file.name }); };
        reader.readAsText(file);
      } else {
        // PDF: send filename only (not processed client-side)
        resolve({ text: "", filename: file.name });
      }
    });
  }

  // ── Image upload handling ────────────────────────────────────────────────────

  function addImage(file) {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      const dataURL = e.target.result;
      uploadedImages.push({ name: file.name, dataURL: dataURL });
      renderImagePreviews();
    };
    reader.readAsDataURL(file);
  }

  function removeImage(index) {
    uploadedImages.splice(index, 1);
    renderImagePreviews();
  }

  function renderImagePreviews() {
    const container = $("aiImagePreview");
    if (!container) return;
    container.innerHTML = "";
    uploadedImages.forEach(function (img, i) {
      const thumb = document.createElement("div");
      thumb.className = "ai-img-thumb";

      const imgEl = document.createElement("img");
      imgEl.src = img.dataURL;
      imgEl.alt = img.name;

      const removeBtn = document.createElement("button");
      removeBtn.className = "ai-img-thumb-remove";
      removeBtn.textContent = "×";
      removeBtn.type = "button";
      removeBtn.setAttribute("aria-label", "Remove " + img.name);
      removeBtn.addEventListener("click", function () { removeImage(i); });

      thumb.appendChild(imgEl);
      thumb.appendChild(removeBtn);
      container.appendChild(thumb);
    });
  }

  function setupDropZone() {
    const zone = $("aiDropZone");
    const input = $("aiImageInput");
    if (!zone || !input) return;

    zone.addEventListener("click", function () { input.click(); });
    zone.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); }
    });

    zone.addEventListener("dragover", function (e) {
      e.preventDefault();
      zone.classList.add("drag-over");
    });
    zone.addEventListener("dragleave", function () { zone.classList.remove("drag-over"); });
    zone.addEventListener("drop", function (e) {
      e.preventDefault();
      zone.classList.remove("drag-over");
      const files = Array.from(e.dataTransfer.files || []);
      files.forEach(addImage);
    });

    input.addEventListener("change", function () {
      Array.from(input.files || []).forEach(addImage);
      input.value = "";
    });
  }

  // ── Library reference search ─────────────────────────────────────────────────

  function setupLibrarySearch() {
    const btn = $("aiLibrarySearchBtn");
    const input = $("aiLibraryRef");
    const results = $("aiLibraryResults");
    if (!btn || !input || !results) return;

    btn.addEventListener("click", async function () {
      const query = input.value.trim();
      if (!query) { results.textContent = "Enter a search term above."; return; }

      results.textContent = "Searching…";
      try {
        const res = await fetch(
          "/.netlify/functions/teacher-library-search?q=" + encodeURIComponent(query),
          { credentials: "include" }
        );
        if (!res.ok) throw new Error("Search unavailable");
        const data = await res.json();
        if (Array.isArray(data.results) && data.results.length > 0) {
          results.innerHTML = data.results
            .slice(0, 5)
            .map(function (r) { return "<div style='margin-bottom:4px;'>• " + escapeHtml(r.title || r.name || String(r)) + "</div>"; })
            .join("");
        } else {
          results.textContent = "No matching assignments found.";
        }
      } catch (_) {
        results.textContent = "Library search not available — you can type a reference manually above.";
      }
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ── Generate ─────────────────────────────────────────────────────────────────

  async function generate() {
    clearStatus();
    const generateBtn = $("aiGenerateBtn");
    if (generateBtn) generateBtn.disabled = true;
    setProgress(true, "Generating — this may take up to 60 seconds…");

    try {
      // Collect source material
      let sourceText = ($("aiSourceText") || {}).value || "";
      let sourceFilename = "";
      const fileInput = $("aiSourceFile");
      if (fileInput && fileInput.files && fileInput.files[0]) {
        const { text, filename } = await readSourceFile(fileInput.files[0]);
        if (text) sourceText = text;
        sourceFilename = filename;
      }

      // Collect config
      const week = ($("aiWeekNumber") || {}).value || "";
      const chapters = ($("aiChapters") || {}).value || "";
      const theme = ($("aiElaTheme") || {}).value || "";
      const scope = ($("aiScope") || {}).value || "all";
      const model = ($("aiModel") || {}).value || "sonnet";
      const library_ref = ($("aiLibraryRef") || {}).value || "";

      const body = {
        task_type: currentTaskType,
        source_material: sourceText.slice(0, 50000),
        source_filename: sourceFilename,
        week: week,
        chapters: chapters,
        theme: theme,
        scope: scope,
        model: model,
        library_ref: library_ref,
      };

      const res = await fetch("/.netlify/functions/teacher-ai-builder", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(function () { return {}; });

      if (!res.ok || !data.ok) {
        throw new Error(data.error || ("Server error " + res.status));
      }

      // Show result
      const resultTextarea = $("aiResultText");
      if (resultTextarea) resultTextarea.value = data.content || "";
      const resultSection = $("aiResultSection");
      if (resultSection) resultSection.style.display = "";
      resultSection && resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
      showStatus("Generation complete.", "success");

    } catch (err) {
      showStatus(err.message || "Generation failed. Please try again.", "error");
    } finally {
      setProgress(false);
      if (generateBtn) generateBtn.disabled = false;
    }
  }

  // ── Send to Work ─────────────────────────────────────────────────────────────

  function sendToWork() {
    const content = ($("aiResultText") || {}).value || "";
    if (!content.trim()) { showStatus("Nothing to send — generate content first.", "error"); return; }

    try {
      const existing = JSON.parse(localStorage.getItem("rc_tc_work_drafts_v1") || "[]");
      existing.unshift({
        id: "ai_" + Date.now(),
        title: "AI Builder — " + new Date().toLocaleDateString(),
        content: content,
        created_at: new Date().toISOString(),
        source: "ai-builder",
      });
      localStorage.setItem("rc_tc_work_drafts_v1", JSON.stringify(existing));
      showStatus("Draft sent to Work. Opening Work page…", "success");
      setTimeout(function () { location.href = "/teacher/work/"; }, 1200);
    } catch (err) {
      showStatus("Could not save draft: " + err.message, "error");
    }
  }

  // ── Download ZIP ─────────────────────────────────────────────────────────────

  async function downloadZip() {
    const content = ($("aiResultText") || {}).value || "";
    if (!content.trim()) { showStatus("Nothing to download — generate content first.", "error"); return; }

    if (typeof JSZip === "undefined") {
      showStatus("JSZip library not available. Check your network connection — the CDN may be unreachable. As a fallback, you can copy the content above and save it manually as an HTML file.", "error");
      return;
    }

    try {
      const zip = new JSZip();
      zip.file("presentation.html", content);

      uploadedImages.forEach(function (img) {
        const base64Data = img.dataURL.replace(/^data:[^;]+;base64,/, "");
        zip.file("images/" + img.name, base64Data, { base64: true });
      });

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ai-builder-" + Date.now() + ".zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      showStatus("ZIP downloaded.", "success");
    } catch (err) {
      showStatus("Download failed: " + err.message, "error");
    }
  }

  // ── Initialise ───────────────────────────────────────────────────────────────

  function init() {
    // Task type buttons
    ["assignments", "presentations", "both"].forEach(function (type) {
      const btn = $("aiType" + type.charAt(0).toUpperCase() + type.slice(1));
      if (btn) btn.addEventListener("click", function () { selectTaskType(type); });
    });

    setupDropZone();
    setupLibrarySearch();

    const generateBtn = $("aiGenerateBtn");
    if (generateBtn) generateBtn.addEventListener("click", generate);

    const sendBtn = $("aiSendToWorkBtn");
    if (sendBtn) sendBtn.addEventListener("click", sendToWork);

    const downloadBtn = $("aiDownloadZipBtn");
    if (downloadBtn) downloadBtn.addEventListener("click", downloadZip);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}());

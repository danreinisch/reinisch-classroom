
(() => {
  "use strict";

  const STORAGE_KEY = "mc_interview_builder_v8";
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const jsStatus = $("#jsStatus");
  const toastEl = $("#toast");
  const exportPreview = $("#exportPreview");

  const btnAnalyzeAll = $("#btnAnalyzeAll");
  const btnExportMd = $("#btnExportMd");
  const btnExportJson = $("#btnExportJson");
  const btnCopy = $("#btnCopy");
  const btnPrint = $("#btnPrint");
  const btnClearAll = $("#btnClearAll");

  const search = $("#search");
  const jump = $("#jump");
  const focusBtn = $("#focusMode");

  let lastExport = "";
  let focusMode = false;

  // --- Toast
  let toastTimer = null;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1600);
  }

  // --- Storage
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : { fields: {}, meta: { savedAt: null } };
    } catch (e) {
      return { fields: {}, meta: { savedAt: null } };
    }
  }

  function saveState(state) {
    try {
      state.meta = state.meta || {};
      state.meta.savedAt = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // ignore (private mode etc.)
    }
  }

  const state = loadState();

  // Throttle saves to avoid excessive writes
  function throttle(fn, waitMs) {
    let last = 0;
    let t = null;
    let pendingArgs = null;
    return (...args) => {
      const now = Date.now();
      const remaining = waitMs - (now - last);
      pendingArgs = args;
      if (remaining <= 0) {
        last = now;
        fn(...pendingArgs);
        pendingArgs = null;
      } else if (!t) {
        t = setTimeout(() => {
          last = Date.now();
          t = null;
          if (pendingArgs) fn(...pendingArgs);
          pendingArgs = null;
        }, remaining);
      }
    };
  }

  const persist = throttle(() => saveState(state), 450);

  function setField(key, value) {
    state.fields[key] = value;
    persist();
  }

  function getField(key) {
    return state.fields[key] || "";
  }

  // --- Helpers
  function wordsCount(s) {
    const t = (s || "").trim();
    if (!t) return 0;
    return t.split(/\s+/).length;
  }

  function estimateSeconds(words) {
    // 150 wpm ~ 2.5 w/s
    return Math.max(0, Math.round(words / 2.5));
  }

  function normalize(s) {
    return (s || "").toLowerCase();
  }

  // --- Anchor and theme scoring (simple heuristics, useful not perfect)
  const anchorSignals = {
    reliable: ["reliable", "reliability", "resilient", "stability", "uptime", "slo", "sla", "observability", "monitor", "alert"],
    scalable: ["scalable", "scale", "throughput", "latency", "load", "performance", "capacity", "autoscale", "caching", "queue", "backpressure"],
    ambiguous: ["ambiguous", "unclear", "unknown", "messy", "complex", "constraints", "tradeoff", "priorit", "assumption", "iterate", "explore"],
    communicate: ["communicat", "align", "stakeholder", "explain", "clarify", "document", "write", "present", "update", "status"]
  };

  const tjSignals = [
    "tradeoff", "because", "why", "chose", "choice", "designed", "architecture", "failure", "rollback", "feature flag", "canary", "slo", "monitor", "alert",
    "latency", "throughput", "capacity", "cache", "queue", "idempot", "timeout", "retry", "circuit", "rate limit"
  ];

  const collabSignals = [
    "partner", "stakeholder", "product", "qa", "security", "ops", "support", "cross-team", "aligned", "disagree", "pushback", "review", "pair", "mentor", "handoff"
  ];

  const ownSignals = [
    "on-call", "incident", "postmortem", "runbook", "monitor", "alert", "proactive", "prevent", "refactor", "tech debt", "system", "process", "improve", "automation"
  ];

  const hedgeSignals = ["i have no idea", "not sure", "maybe", "i guess", "probably", "kind of", "sort of"];

  function scoreBySignals(text, signals) {
    const t = normalize(text);
    let hits = 0;
    for (const sig of signals) {
      if (t.includes(sig)) hits++;
    }
    if (hits === 0) return 0;
    if (hits <= 2) return 1;
    if (hits <= 5) return 2;
    return 3;
  }

  function anchorCoverage(text) {
    const t = normalize(text);
    const hits = {};
    let n = 0;
    for (const [k, list] of Object.entries(anchorSignals)) {
      hits[k] = list.some(s => t.includes(s));
      if (hits[k]) n++;
    }
    return { hits, count: n };
  }

  function chipSet(el, label, level) {
    if (!el) return;
    el.textContent = label;
    el.classList.remove("chip-muted","chip-ok","chip-warn","chip-bad");
    if (level === "ok") el.classList.add("chip-ok");
    else if (level === "warn") el.classList.add("chip-warn");
    else if (level === "bad") el.classList.add("chip-bad");
    else el.classList.add("chip-muted");
  }

  function analyzeText(text) {
    const wc = wordsCount(text);
    const sec = estimateSeconds(wc);

    const anchor = anchorCoverage(text);
    const tj = scoreBySignals(text, tjSignals);
    const col = scoreBySignals(text, collabSignals);
    const own = scoreBySignals(text, ownSignals);

    const hedges = hedgeSignals.filter(h => normalize(text).includes(h));

    const hasNumbers = /\d/.test(text);
    const hasWhy = /\bbecause\b|\bso that\b|\bwhy\b/.test(normalize(text));
    const hasTradeoff = normalize(text).includes("tradeoff");

    const gaps = [];
    if (anchor.count < 2) gaps.push("Anchor: add 1 line that shows reliability/scale/ambiguity/comms.");
    if (tj < 2) gaps.push("Technical Judgment: add a choice + why + a failure/scale consideration.");
    if (col < 1) gaps.push("Collaboration: name a partner team or how you aligned under disagreement.");
    if (own < 1) gaps.push("Ownership: add 1 proactive follow-up (monitoring/runbook/automation/refactor).");
    if (!hasNumbers) gaps.push("Make it real: add one metric (latency, uptime, defects, deploy time, $$, %).");
    if (!hasWhy) gaps.push("Say why: one sentence explaining the reasoning behind your choice.");
    if (!hasTradeoff && tj >= 1) gaps.push("Tradeoffs: name one tradeoff explicitly + how you mitigated it.");
    if (sec > 110) gaps.push("Too long: trim to 60–90 seconds (3–6 bullets).");

    const strengths = [];
    if (anchor.count >= 2) strengths.push("Anchor is showing up (good).");
    if (tj >= 2) strengths.push("Strong technical judgment signals.");
    if (col >= 1) strengths.push("Collaboration signals present.");
    if (own >= 1) strengths.push("Ownership signals present.");
    if (hasNumbers) strengths.push("Concrete metrics make you believable.");
    if (hasTradeoff) strengths.push("You named tradeoffs — senior signal.");

    const upgrades = [];
    if (tj < 2) upgrades.push("Add: “I chose X over Y because…, and I mitigated risk by…”");
    if (anchor.count < 3) upgrades.push("Add: “We designed for failure by…, and I communicated status/risks by…”");
    if (col < 1) upgrades.push("Add: “I aligned with Product/QA/Security by…, and handled pushback by…”");
    if (own < 1) upgrades.push("Add: “After the release/incident, I drove a follow-up: …”");
    if (hedges.length) upgrades.push("Replace hedges with: “Based on what I know…” + one assumption + one clarifying question.");

    return { wc, sec, anchor, tj, col, own, hedges, strengths, gaps, upgrades };
  }

  function renderFeedback(qid, analysis) {
    const out = $("#" + qid + "-fb");
    if (!out) return;

    const timeLine = `<div class="muted">≈ <strong>${analysis.sec}s</strong> • ${analysis.wc} words</div>`;
    const hedgeLine = analysis.hedges.length
      ? `<div class="muted">Hedging detected: <strong>${analysis.hedges.join(", ")}</strong></div>`
      : "";

    const strengths = analysis.strengths.length
      ? `<ul class="bullets">${analysis.strengths.map(s => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`
      : `<div class="muted">No strong signals detected yet — add one concrete example and a tradeoff.</div>`;

    const gaps = analysis.gaps.length
      ? `<ul class="bullets">${analysis.gaps.map(s => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`
      : `<div class="muted">No big gaps detected. Do one more rep and tighten.</div>`;

    const upgrades = analysis.upgrades.length
      ? `<ul class="bullets">${analysis.upgrades.map(s => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`
      : "";

    out.innerHTML = `
      ${timeLine}
      ${hedgeLine}
      <div style="margin-top:10px"><strong>What’s working</strong>${strengths}</div>
      <div style="margin-top:10px"><strong>Add next rep</strong>${gaps}</div>
      ${upgrades ? `<div style="margin-top:10px"><strong>One-liner upgrades</strong>${upgrades}</div>` : ""}
    `;

    // Chips
    const chipAnchor = $(`[data-chip="${qid}-anchor"]`);
    const chipTJ = $(`[data-chip="${qid}-tj"]`);
    const chipCol = $(`[data-chip="${qid}-col"]`);
    const chipOwn = $(`[data-chip="${qid}-own"]`);

    const anchorLabel = `Anchor: ${analysis.anchor.count}/4`;
    chipSet(chipAnchor, anchorLabel, analysis.anchor.count >= 3 ? "ok" : analysis.anchor.count >= 2 ? "warn" : "bad");

    chipSet(chipTJ, `TJ: ${analysis.tj}/3`, analysis.tj >= 2 ? "ok" : analysis.tj === 1 ? "warn" : "bad");
    chipSet(chipCol, `Collab: ${analysis.col}/3`, analysis.col >= 1 ? "ok" : "bad");
    chipSet(chipOwn, `Own: ${analysis.own}/3`, analysis.own >= 1 ? "ok" : "bad");
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;");
  }

  function gatherQuestionText(qid) {
    const ids = [`${qid}-answer`,`${qid}-ctx`,`${qid}-act`,`${qid}-imp`,`${qid}-trd`,`${qid}-lrn`];
    return ids.map(id => {
      const el = $("#" + id);
      return el ? el.value : "";
    }).join("\n");
  }

  // --- Dictation (Web Speech API)
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const canDictate = !!SpeechRecognition;

  let rec = null;
  let recTarget = null; // textarea
  let recButton = null;

  function stopDictation() {
    if (rec) {
      try { rec.stop(); } catch {}
    }
    rec = null;
    if (recButton) {
      recButton.textContent = "🎤 Dictate";
      recButton.classList.remove("btn-danger");
    }
    recButton = null;
    recTarget = null;
  }

  function startDictation(targetTextarea, buttonEl) {
    if (!canDictate) {
      toast("Dictation not supported here. Use the keyboard mic.");
      return;
    }
    // toggle if already running
    if (rec) {
      stopDictation();
      return;
    }

    recTarget = targetTextarea;
    recButton = buttonEl;

    rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    let finalText = "";
    rec.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const transcript = res[0].transcript;
        if (res.isFinal) finalText += transcript;
        else interim += transcript;
      }
      if (recTarget) {
        // Append final text; keep interim in status via toast
        if (finalText.trim()) {
          const sep = recTarget.value && !recTarget.value.endsWith("\n") ? "\n" : "";
          recTarget.value = recTarget.value + sep + finalText.trim();
          recTarget.dispatchEvent(new Event("input", { bubbles: true }));
          finalText = "";
        }
        if (interim.trim()) toast("Dictating…");
      }
    };

    rec.onerror = () => {
      toast("Dictation error. Try again.");
      stopDictation();
    };
    rec.onend = () => stopDictation();

    try {
      rec.start();
      buttonEl.textContent = "⏹ Stop";
      buttonEl.classList.add("btn-danger");
      toast("Dictation started");
    } catch (e) {
      toast("Couldn't start dictation (permission/browser).");
      stopDictation();
    }
  }

  // --- Build answer from builder
  function buildAnswerFromBuilder(qid) {
    const ctx = getVal(qid + "-ctx");
    const act = getVal(qid + "-act");
    const imp = getVal(qid + "-imp");
    const trd = getVal(qid + "-trd");
    const lrn = getVal(qid + "-lrn");

    const bullets = [];
    if (ctx.trim()) bullets.push(`• Context: ${ctx.trim()}`);
    if (act.trim()) bullets.push(`• Actions: ${act.trim()}`);
    if (imp.trim()) bullets.push(`• Impact: ${imp.trim()}`);
    if (trd.trim()) bullets.push(`• Tradeoff: ${trd.trim()}`);
    if (lrn.trim()) bullets.push(`• Learning: ${lrn.trim()}`);

    const out = bullets.join("\n");
    const ta = $("#" + qid + "-answer");
    if (ta) {
      ta.value = out;
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      toast("Built answer from builder");
    }
  }

  function getVal(id) {
    const el = $("#" + id);
    return el ? el.value : "";
  }

  // --- Export
  function buildExportObject() {
    const qcards = $$(".qcard");
    const out = {
      meta: {
        title: "Mastercard Interview Prep – Stephanie (Builder)",
        version: "v8",
        exportedAt: new Date().toISOString()
      },
      answers: {}
    };

    for (const card of qcards) {
      const qid = card.dataset.qid;
      const qtext = $(".qtext", card)?.textContent?.trim() || "";
      out.answers[qid] = {
        question: qtext,
        answer: getVal(qid + "-answer"),
        builder: {
          context: getVal(qid + "-ctx"),
          actions: getVal(qid + "-act"),
          impact: getVal(qid + "-imp"),
          tradeoffs: getVal(qid + "-trd"),
          learning: getVal(qid + "-lrn")
        }
      };
    }
    return out;
  }

  function exportMarkdown(obj) {
    const lines = [];
    lines.push(`# ${obj.meta.title}`);
    lines.push(`Exported: ${obj.meta.exportedAt}`);
    lines.push("");
    for (const [qid, data] of Object.entries(obj.answers)) {
      lines.push(`## ${qid.toUpperCase()}: ${data.question}`);
      const a = (data.answer || "").trim();
      if (a) {
        lines.push(a);
      } else {
        // If no answer, show builder if present
        const b = data.builder || {};
        const any = Object.values(b).some(v => (v || "").trim());
        if (any) {
          lines.push(`- Context: ${b.context || ""}`);
          lines.push(`- Actions: ${b.actions || ""}`);
          lines.push(`- Impact: ${b.impact || ""}`);
          lines.push(`- Tradeoffs: ${b.tradeoffs || ""}`);
          lines.push(`- Learning: ${b.learning || ""}`);
        } else {
          lines.push(`(no answer yet)`);
        }
      }
      lines.push("");
    }
    return lines.join("\n");
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied");
      return true;
    } catch (e) {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        toast("Copied");
        return true;
      } catch {
        toast("Copy failed");
        return false;
      } finally {
        document.body.removeChild(ta);
      }
    }
  }

  // --- UI wiring
  function fillJumpMenu() {
    const opts = [];
    for (const card of $$(".qcard")) {
      const qid = card.dataset.qid;
      const txt = $(".qtext", card)?.textContent?.trim() || "";
      const short = txt.length > 70 ? txt.slice(0, 70) + "…" : txt;
      opts.push({ value: qid, label: `${qid.toUpperCase()} — ${short}` });
    }
    for (const o of opts) {
      const opt = document.createElement("option");
      opt.value = o.value;
      opt.textContent = o.label;
      jump.appendChild(opt);
    }
  }

  function applySearch(term) {
    const t = normalize(term);
    for (const card of $$(".qcard")) {
      const txt = normalize(card.textContent);
      const show = !t || txt.includes(t);
      card.style.display = show ? "" : "none";
    }
  }

  function openCard(card) {
    const btn = $(".js-toggle", card);
    const body = $("#" + card.dataset.qid + "-body");
    if (!btn || !body) return;
    body.hidden = false;
    btn.textContent = "Close";
    btn.setAttribute("aria-expanded", "true");
  }

  function closeCard(card) {
    const btn = $(".js-toggle", card);
    const body = $("#" + card.dataset.qid + "-body");
    if (!btn || !body) return;
    body.hidden = true;
    btn.textContent = "Open";
    btn.setAttribute("aria-expanded", "false");
  }

  function toggleCard(card) {
    const body = $("#" + card.dataset.qid + "-body");
    if (!body) return;

    const willOpen = body.hidden;

    if (focusMode && willOpen) {
      // Close all others in focus mode
      for (const other of $$(".qcard")) {
        if (other !== card) closeCard(other);
      }
      // Scroll into view (mobile-friendly)
      card.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    body.hidden = !willOpen;
    const btn = $(".js-toggle", card);
    if (btn) {
      btn.textContent = willOpen ? "Close" : "Open";
      btn.setAttribute("aria-expanded", String(willOpen));
    }
  }

  // --- Init: set status
  if (jsStatus) {
    jsStatus.textContent = "JS: loaded";
    jsStatus.classList.remove("pill-muted");
  }

  // Disable dictate buttons if unavailable
  if (!canDictate) {
    for (const b of $$(".js-dictate")) {
      b.disabled = true;
      b.title = "Dictation not supported in this browser";
      b.textContent = "🎤 Dictate (N/A)";
    }
  }

  // Restore saved fields
  for (const ta of $$("textarea")) {
    const key = ta.id;
    const v = getField(key);
    if (v) ta.value = v;

    ta.addEventListener("input", () => setField(key, ta.value));
  }

  // Wire per-card buttons
  for (const card of $$(".qcard")) {
    const qid = card.dataset.qid;

    const toggleBtn = $(".js-toggle", card);
    if (toggleBtn) {
      toggleBtn.addEventListener("click", () => toggleCard(card));
    }

    const dictateBtn = $(".js-dictate", card);
    if (dictateBtn) {
      dictateBtn.addEventListener("click", () => {
        const target = $("#" + qid + "-answer");
        if (!target) return;
        // ensure card open so user can see
        openCard(card);
        startDictation(target, dictateBtn);
      });
    }

    const feedbackBtn = $(".js-feedback", card);
    if (feedbackBtn) {
      feedbackBtn.addEventListener("click", () => {
        openCard(card);
        const text = gatherQuestionText(qid);
        const analysis = analyzeText(text);
        renderFeedback(qid, analysis);
        toast("Feedback generated");
      });
    }

    const clearFb = $(".js-clearFeedback", card);
    if (clearFb) {
      clearFb.addEventListener("click", () => {
        const out = $("#" + qid + "-fb");
        if (out) out.innerHTML = `<div class="muted">Cleared. Click <strong>Get feedback</strong> after you write.</div>`;
        // reset chips
        chipSet($(`[data-chip="${qid}-anchor"]`), "Anchor: —", "muted");
        chipSet($(`[data-chip="${qid}-tj"]`), "TJ: —", "muted");
        chipSet($(`[data-chip="${qid}-col"]`), "Collab: —", "muted");
        chipSet($(`[data-chip="${qid}-own"]`), "Own: —", "muted");
      });
    }

    const clearFieldBtns = $$(".js-clearField", card);
    for (const b of clearFieldBtns) {
      b.addEventListener("click", () => {
        const id = b.dataset.target;
        const el = $("#" + id);
        if (el) {
          el.value = "";
          el.dispatchEvent(new Event("input", { bubbles: true }));
          toast("Cleared");
        }
      });
    }

    const buildBtn = $(".js-build", card);
    if (buildBtn) {
      buildBtn.addEventListener("click", () => buildAnswerFromBuilder(qid));
    }
  }

  // Section open/close all
  for (const sec of $$(".section")) {
    const openBtn = $(".js-openSection", sec);
    const closeBtn = $(".js-closeSection", sec);
    const cards = $$(".qcard", sec);

    openBtn?.addEventListener("click", () => {
      for (const c of cards) openCard(c);
      toast("Section opened");
    });
    closeBtn?.addEventListener("click", () => {
      for (const c of cards) closeCard(c);
      toast("Section closed");
    });
  }

  // Global actions
  btnExportMd?.addEventListener("click", () => {
    const obj = buildExportObject();
    lastExport = exportMarkdown(obj);
    exportPreview.textContent = lastExport;
    toast("Exported Markdown");
  });

  btnExportJson?.addEventListener("click", () => {
    const obj = buildExportObject();
    lastExport = JSON.stringify(obj, null, 2);
    exportPreview.textContent = lastExport;
    toast("Exported JSON");
  });

  btnCopy?.addEventListener("click", async () => {
    if (!lastExport) {
      toast("Export something first");
      return;
    }
    await copyToClipboard(lastExport);
  });

  btnPrint?.addEventListener("click", () => window.print());

  btnClearAll?.addEventListener("click", () => {
    const ok = confirm("Clear all saved answers in this browser?");
    if (!ok) return;
    localStorage.removeItem(STORAGE_KEY);
    // clear UI
    for (const ta of $$("textarea")) {
      ta.value = "";
    }
    exportPreview.textContent = "(Cleared.)";
    toast("Cleared all");
  });

  btnAnalyzeAll?.addEventListener("click", () => {
    const rows = [];
    for (const card of $$(".qcard")) {
      const qid = card.dataset.qid;
      const qtext = $(".qtext", card)?.textContent?.trim() || "";
      const text = gatherQuestionText(qid);
      const a = analyzeText(text);
      const filled = wordsCount(text) > 0;
      if (!filled) continue;
      rows.push({
        qid,
        question: qtext,
        seconds: a.sec,
        anchor: `${a.anchor.count}/4`,
        tj: `${a.tj}/3`,
        collab: `${a.col}/3`,
        own: `${a.own}/3`,
      });
    }

    if (!rows.length) {
      exportPreview.textContent = "No answers yet. Write something first, then Analyze all.";
      toast("Nothing to analyze");
      return;
    }

    // Build a compact report
    const lines = [];
    lines.push("ANALYZE ALL (summary)");
    lines.push(new Date().toISOString());
    lines.push("");
    for (const r of rows) {
      lines.push(`${r.qid.toUpperCase()} • ${r.seconds}s • Anchor ${r.anchor} • TJ ${r.tj} • Collab ${r.collab} • Own ${r.own}`);
      lines.push(`- ${r.question}`);
    }
    lastExport = lines.join("\n");
    exportPreview.textContent = lastExport;
    toast("Analyze all complete");
  });

  // Search & jump
  search?.addEventListener("input", () => applySearch(search.value));

  jump?.addEventListener("change", () => {
    const val = jump.value;
    if (!val) return;
    const card = $("#" + val);
    if (card) {
      openCard(card);
      card.scrollIntoView({ behavior: "smooth", block: "start" });
      toast("Jumped");
    }
  });

  focusBtn?.addEventListener("click", () => {
    focusMode = !focusMode;
    focusBtn.setAttribute("aria-pressed", String(focusMode));
    focusBtn.textContent = focusMode ? "On" : "Off";
    toast(focusMode ? "Focus mode on" : "Focus mode off");
  });

  // Build jump menu last
  fillJumpMenu();

  // Safety: stop dictation on navigation/blur
  window.addEventListener("beforeunload", () => stopDictation());
  window.addEventListener("visibilitychange", () => {
    if (document.hidden) stopDictation();
  });
})();

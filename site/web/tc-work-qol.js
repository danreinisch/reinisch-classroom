/* BEGIN rc-tc-work-qol v1 */
(() => {
  // Only run on Teacher Center Work page
  if (!location.pathname.startsWith("/teacher/work")) return;

  const TAG = "[tc-work-qol]";
  const log = (...a) => console.log(TAG, ...a);

  // NOTE: Keep in sync with CANON_CLASSES in tc-work.js
  const CLASS_LABELS = [
    "LA 1 SC",
    "LA 2 SC",
    "LA 3 SC",
    "LA 4 SC",
    "Life Skills LA",
    "Life Skills",
  ];

  const ready = (fn) => {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn, { once: true });
  };

  const norm = (s) => (s || "").trim().toLowerCase();

  const findClassSelect = () => {
    const selects = Array.from(document.querySelectorAll("select"));
    // pick the select that contains LA 1 SC + LA 4 SC (very likely the class dropdown)
    const best = selects.find((sel) => {
      const opts = Array.from(sel.options || []).map((o) => (o.textContent || "").trim());
      return opts.includes("LA 1 SC") && opts.includes("LA 4 SC");
    });
    return best || null;
  };

  const findSaveButton = () => {
    const btns = Array.from(document.querySelectorAll("button"));
    return btns.find((b) => (b.textContent || "").trim() === "Save Draft") || null;
  };

  const injectStyle = () => {
    if (document.getElementById("rcTcWorkQolStyle")) return;
    const st = document.createElement("style");
    st.id = "rcTcWorkQolStyle";
    st.textContent = `
      .rc-qol-row{ display:flex; gap:12px; flex-wrap:wrap; align-items:center; margin-top:10px; }
      .rc-qol-row label{ display:flex; gap:8px; align-items:center; font-size:12px; opacity:.95; }
      .rc-qol-box{ border:1px solid rgba(255,255,255,.10); border-radius:10px; padding:10px 12px; background:rgba(0,0,0,.18); }
      .rc-qol-box select{ min-width: 240px; max-width: 520px; }
      .rc-qol-hint{ font-size:11px; opacity:.8; margin-top:6px; }
    `;
    document.head.appendChild(st);
  };

  const ensureLifeSkillsOption = (classSelect) => {
    const labels = Array.from(classSelect.options).map((o) => (o.textContent || "").trim());
    if (!labels.includes("Life Skills")) {
      const opt = document.createElement("option");
      opt.value = "Life Skills";
      opt.textContent = "Life Skills";
      // put it right next to Life Skills LA if present
      const idx = labels.indexOf("Life Skills LA");
      if (idx >= 0 && classSelect.options[idx]) {
        classSelect.add(opt, classSelect.options[idx]);
      } else {
        classSelect.add(opt);
      }
      log("Added class option:", "Life Skills");
    }
  };

  const buildQolControls = (classSelect) => {
    if (document.getElementById("rcQolControls")) return;

    // container near the class select
    const host = classSelect.closest(".field, .form-field, .input-group, div") || classSelect.parentElement;
    if (!host) return;

    injectStyle();
    ensureLifeSkillsOption(classSelect);

    const wrap = document.createElement("div");
    wrap.id = "rcQolControls";
    wrap.className = "rc-qol-row";

    // DEDUP GUARD: Check if rc-work-mega-ux v1 already created its mega checkbox.
    // The two mega systems are complementary (bare headers vs === separators),
    // but we prevent duplicate UI by skipping our mega toggle if theirs exists.
    const megaBoxHtml = document.getElementById("rcMegaMode") ? "" : `
      <div class="rc-qol-box">
        <label>
          <input type="checkbox" id="rcMegaSplitToggle" />
          Mega-split draft by class headers in the assignment file
        </label>
        <div class="rc-qol-hint">
          Looks for headers like "LA 1 SC", "LA 2 SC", "Life Skills", etc. Creates one draft per detected section.
        </div>
      </div>
    `;

    wrap.innerHTML = `
      <div class="rc-qol-box">
        <label>
          <input type="checkbox" id="rcMultiClassToggle" />
          Apply to multiple classes
        </label>
        <div style="margin-top:8px; display:none;" id="rcMultiClassPanel">
          <select id="rcMultiClassSelect" multiple size="6"></select>
          <div class="rc-qol-hint">Tip: hold ⌘/Ctrl to select multiple.</div>
        </div>
      </div>

      ${megaBoxHtml}
    `;

    // insert after the select's host block
    host.appendChild(wrap);

    const multiToggle = wrap.querySelector("#rcMultiClassToggle");
    const multiPanel  = wrap.querySelector("#rcMultiClassPanel");
    const multiSelect = wrap.querySelector("#rcMultiClassSelect");

    // populate multi-select from classSelect options
    const opts = Array.from(classSelect.options).map((o) => ({ value: o.value, label: (o.textContent||"").trim() }));
    const seen = new Set();
    for (const o of opts) {
      const key = `${o.value}||${o.label}`;
      if (!o.label || seen.has(key)) continue;
      seen.add(key);
      const opt = document.createElement("option");
      opt.value = o.value || o.label;
      opt.textContent = o.label;
      multiSelect.appendChild(opt);
    }

    // show/hide panel
    multiToggle.addEventListener("change", () => {
      multiPanel.style.display = multiToggle.checked ? "block" : "none";
      // Keep classSelect valid by defaulting to first selected
      if (multiToggle.checked) {
        const first = multiSelect.options[0];
        if (first && !Array.from(multiSelect.selectedOptions).length) first.selected = true
      }
    });

    // pick a sane default selection if none
    if (multiSelect.options.length) {
      multiSelect.options[0].selected = true;
    }

    // keep single class select aligned so native validation doesn't block Save
    multiSelect.addEventListener("change", () => {
      const sel = Array.from(multiSelect.selectedOptions).map((o) => o.value);
      if (sel.length) classSelect.value = sel[0];
    });
  };

  const snapshotLocalStorage = () => {
    const snap = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      snap[k] = localStorage.getItem(k);
    }
    return snap;
  };

  const parseJsonArray = (txt) => {
    try {
      const v = JSON.parse(txt);
      return Array.isArray(v) ? v : null;
    } catch {
      return null;
    }
  };

  const findChangedDraftStore = (beforeSnap, afterSnap) => {
    const changed = [];
    for (const [k, v] of Object.entries(afterSnap)) {
      if (beforeSnap[k] !== v) {
        const arr = parseJsonArray(v);
        if (arr && arr.length && typeof arr[0] === "object") changed.push([k, arr]);
      }
    }
    // prefer keys that look like work drafts
    changed.sort((a, b) => {
      const ak = a[0].toLowerCase();
      const bk = b[0].toLowerCase();
      const as = (ak.includes("draft") ? 2 : 0) + (ak.includes("work") ? 2 : 0) + (ak.includes("tc") ? 1 : 0);
      const bs = (bk.includes("draft") ? 2 : 0) + (bk.includes("work") ? 2 : 0) + (bk.includes("tc") ? 1 : 0);
      return bs - as;
    });
    return changed[0] || null;
  };

  const sig = (obj) => {
    if (!obj || typeof obj !== "object") return "";
    return obj.id || obj.uuid || obj._id || obj.key || obj.slug || "";
  };

  const deepClone = (obj) => {
    try { return structuredClone(obj); } catch { return JSON.parse(JSON.stringify(obj)); }
  };

  const walkStrings = (obj, out, path = []) => {
    if (obj == null) return;
    if (typeof obj === "string") {
      out.push({ path, value: obj });
      return;
    }
    if (Array.isArray(obj)) {
      obj.forEach((v, i) => walkStrings(v, out, path.concat(i)));
      return;
    }
    if (typeof obj === "object") {
      Object.entries(obj).forEach(([k, v]) => walkStrings(v, out, path.concat(k)));
    }
  };

  const getByPath = (obj, path) => {
    let cur = obj;
    for (const p of path) cur = cur?.[p];
    return cur;
  };

  const setByPath = (obj, path, value) => {
    let cur = obj;
    for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]];
    cur[path[path.length - 1]] = value;
  };

  const replaceLongestString = (draft, newText) => {
    const strings = [];
    walkStrings(draft, strings);
    strings.sort((a, b) => (b.value.length || 0) - (a.value.length || 0));
    const top = strings.find((x) => (x.value || "").length > 200);
    if (!top) return false;
    setByPath(draft, top.path, newText);
    return true;
  };

  const guessAndSetClass = (draft, newClass) => {
    const strings = [];
    walkStrings(draft, strings);
    // replace any exact class label occurrences in string fields (small + safe)
    let changed = false;
    for (const s of strings) {
      const v = (s.value || "").trim();
      if (CLASS_LABELS.includes(v)) {
        setByPath(draft, s.path, newClass);
        changed = true;
      }
    }
    // common keys
    for (const k of ["class", "className", "classLabel", "class_id", "classId"]) {
      if (typeof draft?.[k] === "string") {
        draft[k] = newClass;
        changed = true;
      }
    }
    return changed;
  };

  const splitByClassHeaders = (text) => {
    const raw = text || "";
    const lines = raw.split(/\r?\n/);

    // find header line indexes
    const headers = [];
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();
      if (!t) continue;
      const up = t.toUpperCase();
      // support LIFE SKILLS variants
      const normalized =
        up === "LIFE SKILLS" ? "Life Skills" :
        up === "LIFE SKILLS LA" ? "Life Skills LA" :
        CLASS_LABELS.find((c) => c.toUpperCase() === up) || null;

      if (normalized) headers.push({ i, cls: normalized });
    }

    if (headers.length < 2) return null;

    // slice sections
    const sections = {};
    for (let h = 0; h < headers.length; h++) {
      const start = headers[h].i;
      const end = (h + 1 < headers.length) ? headers[h + 1].i : lines.length;
      const cls = headers[h].cls;
      const chunk = lines.slice(start, end).join("\n").trim();
      if (chunk) sections[cls] = chunk;
    }
    return Object.keys(sections).length ? sections : null;
  };

  const forceCloseModals = () => {
    // Capture "Close" clicks even when underlying code forgets to wire handlers.
    document.addEventListener("click", (e) => {
      const btn = e.target?.closest?.("button, a");
      if (!btn) return;
      const t = norm(btn.textContent);
      if (t !== "close") return;

      // Try: close nearest dialog/modal-ish container
      const modal =
        btn.closest("[role='dialog']") ||
        btn.closest("dialog") ||
        btn.closest(".modal") ||
        btn.closest(".rc-modal") ||
        btn.closest(".overlay") ||
        btn.closest("[data-modal]");

      if (modal) {
        e.preventDefault();
        e.stopPropagation();
        modal.remove();
      }
    }, true);

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      const dlg = document.querySelector("dialog[open], [role='dialog'], .modal, .rc-modal, .overlay, [data-modal]");
      if (dlg) dlg.remove?.();
    }, true);
  };

  const postProcessSave = (beforeSnap, cfg) => {
    const afterSnap = snapshotLocalStorage();
    const changedStore = findChangedDraftStore(beforeSnap, afterSnap);
    if (!changedStore) return;

    const [storeKey, drafts] = changedStore;

    // Find the newly added draft
    const beforeArr = parseJsonArray(beforeSnap[storeKey] || "[]") || [];
    const beforeSigs = new Set(beforeArr.map(sig).filter(Boolean));
    let newIdx = drafts.findIndex((d) => !beforeSigs.has(sig(d)));
    if (newIdx < 0) newIdx = 0;
    const base = drafts[newIdx];
    if (!base || typeof base !== "object") return;

    // If neither toggle is on, do nothing
    if (!cfg.multi && !cfg.mega) return;

    const baseClone = deepClone(base);

    // For mega split: use the longest text field inside the saved draft as the source to split
    let megaSections = null
    if (cfg.mega) {
      const strings = [];
      walkStrings(baseClone, strings);
      strings.sort((a, b) => (b.value.length || 0) - (a.value.length || 0));
      const body = (strings.find((x) => (x.value || "").length > 200) || {}).value || "";
      megaSections = splitByClassHeaders(body);
      if (!megaSections) {
        log("Mega-split checked, but no class headers detected. Skipping split.");
      }
    }

    // Determine classes to create drafts for
    const classes =
      megaSections ? Object.keys(megaSections)
      : (cfg.classes && cfg.classes.length ? cfg.classes : []);

    if (!classes.length) return;

    // Build clones for each class (keeping base as one of them)
    const clones = [];
    for (const cls of classes) {
      const d = deepClone(baseClone);
      guessAndSetClass(d, cls);
      if (megaSections && megaSections[cls]) {
        replaceLongestString(d, megaSections[cls]);
      }
      // ensure unique-ish id if present
      if (d.id) d.id = `${d.id}__${cls.replace(/\s+/g, "_")}__${Date.now()}`;
      if (d.uuid) d.uuid = `${d.uuid}__${cls.replace(/\s+/g, "_")}__${Date.now()}`;
      clones.push(d);
    }

    // Replace the single base draft with the clones (in-place)
    drafts.splice(newIdx, 1, ...clones);

    localStorage.setItem(storeKey, JSON.stringify(drafts));
    log("Saved multi/mega drafts to store:", storeKey, "count:", clones.length);

    // Reload so the page re-renders Drafts list using its normal code
    setTimeout(() => location.reload(), 50);
  };

  ready(() => {
    try {
      const classSelect = findClassSelect();
      if (!classSelect) return log("Could not find class dropdown. Skipping QoL.");

      ensureLifeSkillsOption(classSelect);
      buildQolControls(classSelect);
      forceCloseModals();

      const saveBtn = findSaveButton();
      if (!saveBtn) return log("Could not find Save Draft button. QoL loaded (partial).");

      // Capture phase: snapshot storage BEFORE app saves, then post-process AFTER
      saveBtn.addEventListener("click", () => {
        const beforeSnap = snapshotLocalStorage();

        const multi = !!document.getElementById("rcMultiClassToggle")?.checked;
        const mega  = !!document.getElementById("rcMegaSplitToggle")?.checked;

        const sel = Array.from(document.getElementById("rcMultiClassSelect")?.selectedOptions || [])
          .map((o) => (o.value || o.textContent || "").trim())
          .filter(Boolean);

        const cfg = { multi, mega, classes: sel };

        // Let the original save happen, then duplicate/split the freshly saved draft(s)
        setTimeout(() => postProcessSave(beforeSnap, cfg), 350);
      }, true);

      log("Loaded ✅ (Life Skills + multi-class + mega-split + close-fix)");
    } catch (err) {
      console.error(TAG, "Error:", err);
    }
  });
})();
/* END rc-tc-work-qol v1 */

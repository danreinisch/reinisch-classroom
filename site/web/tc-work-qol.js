/* BEGIN rc-tc-work-qol v1 */
(() => {
  // Only run on Teacher Center Work page
  if (!location.pathname.startsWith("/teacher/work")) return;

  const TAG = "[tc-work-qol]";
  const log = (...a) => console.log(TAG, ...a);

  // NOTE: Keep in sync with CANON_CLASSES in tc-work.js
  const CLASS_LABELS = [
    "Language Arts 1 SC",
    "Language Arts 2 SC",
    "Language Arts 3 SC",
    "Language Arts 4 SC",
    "Life Skills Language Arts SC",
    "Transitional Skills",
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

  // DISABLED: These helper functions are no longer used since the multi-class
  // and mega-split features have been replaced by the file preview panel.
  // Keeping them commented out for reference.
  
  // const findSaveButton = () => {
  //   const btns = Array.from(document.querySelectorAll("button"));
  //   return btns.find((b) => (b.textContent || "").trim() === "Save Draft") || null;
  // };

  // const injectStyle = () => {
  //   if (document.getElementById("rcTcWorkQolStyle")) return;
  //   const st = document.createElement("style");
  //   st.id = "rcTcWorkQolStyle";
  //   st.textContent = `
  //     .rc-qol-row{ display:flex; gap:12px; flex-wrap:wrap; align-items:center; margin-top:10px; }
  //     .rc-qol-row label{ display:flex; gap:8px; align-items:center; font-size:12px; opacity:.95; }
  //     .rc-qol-box{ border:1px solid rgba(255,255,255,.10); border-radius:10px; padding:10px 12px; background:rgba(0,0,0,.18); }
  //     .rc-qol-box select{ min-width: 240px; max-width: 520px; }
  //     .rc-qol-hint{ font-size:11px; opacity:.8; margin-top:6px; }
  //   `;
  //   document.head.appendChild(st);
  // };

  const ensureTransitionalSkillsOption = (classSelect) => {
    const labels = Array.from(classSelect.options).map((o) => (o.textContent || "").trim());
    if (!labels.includes("Transitional Skills")) {
      const opt = document.createElement("option");
      opt.value = "Transitional Skills";
      opt.textContent = "Transitional Skills";
      // put it right next to Life Skills LA if present
      const idx = labels.indexOf("Life Skills LA");
      if (idx >= 0 && classSelect.options[idx]) {
        classSelect.add(opt, classSelect.options[idx]);
      } else {
        classSelect.add(opt);
      }
      log("Added class option:", "Transitional Skills");
    }
  };

  const buildQolControls = (classSelect) => {
    // DISABLED: The multi-class and mega-split checkboxes have been replaced
    // by the new file preview panel (rc-work-mega-ux v2 in tc-work.js).
    // We keep ensureTransitionalSkillsOption and forceCloseModals active.
    ensureTransitionalSkillsOption(classSelect);
    log("QoL controls disabled (replaced by file preview panel)");
  };

  // DISABLED: These utility functions are no longer used since the multi-class
  // and mega-split post-processing has been replaced by the file preview panel.
  
  // const snapshotLocalStorage = () => {
  //   const snap = {};
  //   for (let i = 0; i < localStorage.length; i++) {
  //     const k = localStorage.key(i);
  //     snap[k] = localStorage.getItem(k);
  //   }
  //   return snap;
  // };

  // const parseJsonArray = (txt) => {
  //   try {
  //     const v = JSON.parse(txt);
  //     return Array.isArray(v) ? v : null;
  //   } catch {
  //     return null;
  //   }
  // };

  // const findChangedDraftStore = (beforeSnap, afterSnap) => {
  //   const changed = [];
  //   for (const [k, v] of Object.entries(afterSnap)) {
  //     if (beforeSnap[k] !== v) {
  //       const arr = parseJsonArray(v);
  //       if (arr && arr.length && typeof arr[0] === "object") changed.push([k, arr]);
  //     }
  //   }
  //   // prefer keys that look like work drafts
  //   changed.sort((a, b) => {
  //     const ak = a[0].toLowerCase();
  //     const bk = b[0].toLowerCase();
  //     const as =
  //       (ak.includes("draft") ? 2 : 0) +
  //       (ak.includes("work") ? 2 : 0) +
  //       (ak.includes("tc") ? 1 : 0);
  //     const bs =
  //       (bk.includes("draft") ? 2 : 0) +
  //       (bk.includes("work") ? 2 : 0) +
  //       (bk.includes("tc") ? 1 : 0);
  //     return bs - as;
  //   });
  //   return changed[0] || null;
  // };

  // const sig = (obj) => {
  //   if (!obj || typeof obj !== "object") return "";
  //   return obj.id || obj.uuid || obj._id || obj.key || obj.slug || "";
  // };

  // const deepClone = (obj) => {
  //   try {
  //     return structuredClone(obj);
  //   } catch {
  //     return JSON.parse(JSON.stringify(obj));
  //   }
  // };

  // const walkStrings = (obj, out, path = []) => {
  //   if (obj == null) return;
  //   if (typeof obj === "string") {
  //     out.push({ path, value: obj });
  //     return;
  //   }
  //   if (Array.isArray(obj)) {
  //     obj.forEach((v, i) => walkStrings(v, out, path.concat(i)));
  //     return;
  //   }
  //   if (typeof obj === "object") {
  //     Object.entries(obj).forEach(([k, v]) => walkStrings(v, out, path.concat(k)));
  //   }
  // };

  // const setByPath = (obj, path, value) => {
  //   let cur = obj;
  //   for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]];
  //   cur[path[path.length - 1]] = value;
  // };

  // const replaceLongestString = (draft, newText) => {
  //   const strings = [];
  //   walkStrings(draft, strings);
  //   strings.sort((a, b) => (b.value.length || 0) - (a.value.length || 0));
  //   const top = strings.find((x) => (x.value || "").length > 200);
  //   if (!top) return false;
  //   setByPath(draft, top.path, newText);
  //   return true;
  // };

  // const guessAndSetClass = (draft, newClass) => {
  //   const strings = [];
  //   walkStrings(draft, strings);
  //   // replace any exact class label occurrences in string fields (small + safe)
  //   let changed = false;
  //   for (const s of strings) {
  //     const v = (s.value || "").trim();
  //     if (CLASS_LABELS.includes(v)) {
  //       setByPath(draft, s.path, newClass);
  //       changed = true;
  //     }
  //   }
  //   // common keys
  //   for (const k of ["class", "className", "classLabel", "class_id", "classId"]) {
  //     if (typeof draft?.[k] === "string") {
  //       draft[k] = newClass;
  //       changed = true;
  //     }
  //   }
  //   return changed;
  // };

  // const splitByClassHeaders = (text) => {
  //   const raw = text || "";
  //   const lines = raw.split(/\r?\n/);
  //
  //   // find header line indexes
  //   const headers = [];
  //   for (let i = 0; i < lines.length; i++) {
  //     const t = lines[i].trim();
  //     if (!t) continue;
  //     const up = t.toUpperCase();
  //     // support LIFE SKILLS variants
  //     const normalized =
  //       up === "LIFE SKILLS"
  //         ? "Life Skills"
  //         : up === "LIFE SKILLS LA"
  //           ? "Life Skills LA"
  //           : CLASS_LABELS.find((c) => c.toUpperCase() === up) || null;
  //
  //     if (normalized) headers.push({ i, cls: normalized });
  //   }
  //
  //   if (headers.length < 2) return null;
  //
  //   // slice sections
  //   const sections = {};
  //   for (let h = 0; h < headers.length; h++) {
  //     const start = headers[h].i;
  //     const end = h + 1 < headers.length ? headers[h + 1].i : lines.length;
  //     const cls = headers[h].cls;
  //     const chunk = lines.slice(start, end).join("\n").trim();
  //     if (chunk) sections[cls] = chunk;
  //   }
  //   return Object.keys(sections).length ? sections : null;
  // };

  const forceCloseModals = () => {
    // Capture "Close" clicks even when underlying code forgets to wire handlers.
    document.addEventListener(
      "click",
      (e) => {
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
          // Skip draftOverlay - it has its own close handler in tc-work.js
          if (modal.id === 'draftOverlay' || modal.closest('#draftOverlay')) return;
          
          e.preventDefault();
          e.stopPropagation();
          // Don't remove reusable modals - hide them instead
          if (modal.id) {
            modal.hidden = true;
          } else {
            modal.remove();
          }
        }
      },
      true
    );

    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "Escape") return;
        const dlg = document.querySelector(
          "dialog[open]:not([hidden]), [role='dialog']:not([hidden]), .modal:not([hidden]), .rc-modal:not([hidden]), .overlay:not([hidden]), [data-modal]:not([hidden])"
        );
        if (dlg) {
          // Skip elements inside #draftOverlay - let tc-work.js handle it
          if (dlg.id === 'draftOverlay' || dlg.closest('#draftOverlay')) {
            return;
          }
          // Don't remove reusable modals - hide them instead
          if (dlg.id) {
            dlg.hidden = true;
          } else {
            dlg.remove?.();
          }
        }
      },
      true
    );
  };

  // DISABLED: postProcessSave is no longer needed as the file preview panel
  // handles multi-class and mega-split directly in tc-work.js.
  // const postProcessSave = (beforeSnap, cfg) => {
  //   log("postProcessSave disabled (replaced by file preview panel)");
  // };

  ready(() => {
    try {
      const classSelect = findClassSelect();
      if (!classSelect) return log("Could not find class dropdown. Skipping QoL.");

      ensureTransitionalSkillsOption(classSelect);
      buildQolControls(classSelect); // Now just ensures Life Skills option
      forceCloseModals();

      log("Loaded ✅ (Life Skills + close-fix; multi-class features replaced by file preview panel)");
    } catch (err) {
      console.error(TAG, "Error:", err);
    }
  });
})();
/* END rc-tc-work-qol v1 */

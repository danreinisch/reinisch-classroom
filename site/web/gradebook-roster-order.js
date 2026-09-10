// Teacher Gradebook roster presentation order.
//
// The six current 2026–27 classroom rosters use an explicit pseudonymous
// student-code stack captured from Infinite Campus as their default grade-entry
// order. Teachers can override that order per class from the Gradebook; custom
// orders are stored only in this browser and use student codes only.
//
// Locked/default or teacher-saved class orders win over Gradebook column sorting
// so the vertical student stack does not move while grades are transferred.
// New/unmapped student codes remain visible at the bottom until the teacher
// deliberately places them.

const NAME_COLLATOR = new Intl.Collator("en-US", {
  sensitivity: "base",
  numeric: true,
});

export const STUDENT_ORDER_STORAGE_KEY =
  "rc_gradebook_student_order_2026_27_v1";

export const LOCKED_IC_ROSTER_ORDER = Object.freeze({
  "Language Arts 1 SC": Object.freeze([
    "S062", "S049", "S071", "S063", "S060", "S064", "S056", "S067", "S055",
    "S052", "S061", "S065", "S053", "S041", "S072", "S054", "S051",
  ]),
  "Language Arts 2 SC": Object.freeze([
    "S025", "S047", "S048", "S040", "S026", "S042", "S066", "S041", "S074",
    "S028", "S036",
  ]),
  "Language Arts 3 SC": Object.freeze([
    "S057", "S019", "S069", "S023", "S070", "S040", "S033", "S036",
  ]),
  "Language Arts 4 SC": Object.freeze([
    "S016", "S031", "S003", "S004", "S039", "S009",
  ]),
  "Life Skills Language Arts SC": Object.freeze([
    "S015", "S059", "S017", "S018", "S073", "S020", "S058",
  ]),
  "Transitional Skills": Object.freeze([
    "S015", "S059", "S017", "S018", "S031", "S003", "S073", "S020", "S004",
    "S006", "S058", "S008", "S009",
  ]),
});

function normalizeClassName(className) {
  return String(className || "").trim();
}

function normalizeOrderCodes(codes) {
  const seen = new Set();
  const normalized = [];

  for (const raw of Array.isArray(codes) ? codes : []) {
    const code = String(raw || "").trim();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    normalized.push(code);
  }

  return normalized;
}

function resolveStorage(root, explicitStorage) {
  if (explicitStorage) return explicitStorage;

  try {
    const storage = root?.defaultView?.localStorage;
    if (storage) return storage;
  } catch {
    // localStorage can be unavailable in hardened/private browsing contexts.
  }

  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Same fallback rule as above: Gradebook order still works from defaults.
  }

  return null;
}

function readOrderStore(storage) {
  if (!storage || typeof storage.getItem !== "function") return {};

  try {
    const parsed = JSON.parse(
      storage.getItem(STUDENT_ORDER_STORAGE_KEY) || "{}"
    );
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function writeOrderStore(storage, store) {
  if (!storage || typeof storage.setItem !== "function") return false;

  try {
    storage.setItem(STUDENT_ORDER_STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

export function getSavedStudentOrder(className, storage) {
  const key = normalizeClassName(className);
  if (!key) return null;

  const saved = readOrderStore(storage)[key];
  const normalized = normalizeOrderCodes(saved);
  return normalized.length ? normalized : null;
}

export function saveStudentOrder(className, codes, storage) {
  const key = normalizeClassName(className);
  const normalized = normalizeOrderCodes(codes);
  if (!key || !normalized.length) return false;

  const store = readOrderStore(storage);
  store[key] = normalized;
  return writeOrderStore(storage, store);
}

export function resetStudentOrder(className, storage) {
  const key = normalizeClassName(className);
  if (!key || !storage) return false;

  const store = readOrderStore(storage);
  if (!Object.prototype.hasOwnProperty.call(store, key)) return true;

  delete store[key];

  try {
    if (Object.keys(store).length === 0) {
      if (typeof storage.removeItem === "function") {
        storage.removeItem(STUDENT_ORDER_STORAGE_KEY);
        return true;
      }
    }
  } catch {
    return false;
  }

  return writeOrderStore(storage, store);
}

export function hasLockedInfiniteCampusRoster(className) {
  return Object.prototype.hasOwnProperty.call(
    LOCKED_IC_ROSTER_ORDER,
    normalizeClassName(className)
  );
}

export function infiniteCampusSortLabel(student) {
  const raw = String(student?.name || student?.code || "").trim();
  if (!raw || raw.includes(",")) return raw;

  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return raw;

  // Runtime names, when available, are given-name first. Everything after the
  // given name stays together so compound family names sort as one surname.
  const [givenName, ...familyNameParts] = parts;
  return `${familyNameParts.join(" ")}, ${givenName}`;
}

export function sortStudentsLikeInfiniteCampus(students) {
  const safeStudents = Array.isArray(students) ? [...students] : [];

  return safeStudents
    .map((student, index) => ({ student, index }))
    .sort((a, b) => {
      const byName = NAME_COLLATOR.compare(
        infiniteCampusSortLabel(a.student),
        infiniteCampusSortLabel(b.student)
      );
      if (byName !== 0) return byName;

      const byCode = NAME_COLLATOR.compare(
        String(a.student?.code || ""),
        String(b.student?.code || "")
      );
      if (byCode !== 0) return byCode;

      return a.index - b.index;
    })
    .map(({ student }) => student);
}

function sortStudentsByCodeOrder(orderCodes, students) {
  const safeStudents = Array.isArray(students) ? [...students] : [];
  const rankByCode = new Map(
    normalizeOrderCodes(orderCodes).map((code, index) => [code, index])
  );

  return safeStudents
    .map((student, index) => ({ student, index }))
    .sort((a, b) => {
      const aCode = String(a.student?.code || "").trim();
      const bCode = String(b.student?.code || "").trim();
      const aRank = rankByCode.has(aCode)
        ? rankByCode.get(aCode)
        : Number.POSITIVE_INFINITY;
      const bRank = rankByCode.has(bCode)
        ? rankByCode.get(bCode)
        : Number.POSITIVE_INFINITY;

      if (aRank !== bRank) return aRank - bRank;

      // Newly enrolled/unmapped students stay after the known order in a stable,
      // deterministic position until the teacher saves an updated class order.
      const byCode = NAME_COLLATOR.compare(aCode, bCode);
      if (byCode !== 0) return byCode;

      return a.index - b.index;
    })
    .map(({ student }) => student);
}

export function sortStudentsByLockedInfiniteCampusOrder(className, students) {
  const lockedCodes =
    LOCKED_IC_ROSTER_ORDER[normalizeClassName(className)];
  if (!lockedCodes) return sortStudentsLikeInfiniteCampus(students);
  return sortStudentsByCodeOrder(lockedCodes, students);
}

export function sortStudentsForGradebookClass(
  className,
  students,
  storage = null
) {
  const savedOrder = getSavedStudentOrder(className, storage);
  if (savedOrder) return sortStudentsByCodeOrder(savedOrder, students);

  return hasLockedInfiniteCampusRoster(className)
    ? sortStudentsByLockedInfiniteCampusOrder(className, students)
    : sortStudentsLikeInfiniteCampus(students);
}

function getActiveClassName(root) {
  const active = root.querySelector("#classFilterBar .gb-filter-btn.active");
  return active ? active.textContent.trim() : "";
}

function hasExplicitColumnSort(root) {
  return Boolean(
    root.querySelector(
      '#gbTableHead th[aria-sort="ascending"], #gbTableHead th[aria-sort="descending"]'
    )
  );
}

function getStudentFromRow(row) {
  const cell = row.querySelector(".gb-student-cell");
  const raw = cell?.dataset?.tooltip;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    const code = typeof parsed?.code === "string" ? parsed.code : "";
    const name = typeof parsed?.name === "string" ? parsed.name : "";
    if (!code && !name) return null;
    return { code, name };
  } catch {
    return null;
  }
}

function getStudentRows(root) {
  const body = root.querySelector("#gbTableBody");
  if (!body) return [];

  return Array.from(body.querySelectorAll("tr"))
    .filter((row) => !row.classList.contains("gb-summary-row"))
    .map((row) => ({ row, student: getStudentFromRow(row) }))
    .filter(({ student }) => student);
}

export function reorderGradebookRows(root = document, explicitStorage = null) {
  const className = getActiveClassName(root);
  if (!className || className === "All Classes") return false;

  const storage = resolveStorage(root, explicitStorage);
  const savedOrder = getSavedStudentOrder(className, storage);
  const hasPinnedRoster =
    Boolean(savedOrder) || hasLockedInfiniteCampusRoster(className);

  // A locked default or a teacher-saved custom order is authoritative even when
  // a score/assignment column has an active sort indicator.
  if (!hasPinnedRoster && hasExplicitColumnSort(root)) return false;

  const body = root.querySelector("#gbTableBody");
  if (!body) return false;

  const studentRows = getStudentRows(root);
  if (studentRows.length < 2) return false;

  const target = sortStudentsForGradebookClass(
    className,
    studentRows.map(({ student }) => student),
    storage
  );
  const rowByCode = new Map(
    studentRows.map(({ row, student }) => [student.code, row])
  );
  const currentCodes = studentRows.map(({ student }) => student.code);
  const targetCodes = target.map((student) => student.code);
  const alreadyOrdered = currentCodes.every(
    (code, index) => code === targetCodes[index]
  );

  if (alreadyOrdered) return false;

  const summaryRow = body.querySelector("tr.gb-summary-row");
  for (const code of targetCodes) {
    const row = rowByCode.get(code);
    if (row) body.insertBefore(row, summaryRow || null);
  }

  for (const { row } of studentRows) row.classList.remove("gb-highlighted");
  const firstStudentRow = targetCodes.length
    ? rowByCode.get(targetCodes[0])
    : null;
  if (firstStudentRow) firstStudentRow.classList.add("gb-highlighted");

  return true;
}

function setOrderStatus(root, controls, message, tone = "") {
  const status = controls?.querySelector(".gb-student-order-status");
  if (status) {
    status.textContent = message;
    status.dataset.tone = tone;
  }

  const live = root.querySelector("#gbA11yStatus");
  if (live) live.textContent = message;
}

function injectStudentOrderStyles(root) {
  if (root.getElementById("gbStudentOrderStyles")) return;

  const style = root.createElement("style");
  style.id = "gbStudentOrderStyles";
  style.textContent = `
    .gb-student-order-controls {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
      flex-wrap: wrap;
    }
    .gb-student-order-controls[hidden] { display: none !important; }
    .gb-student-order-status {
      font-size: 12px;
      opacity: .72;
    }
    .gb-student-order-status[data-tone="saved"] {
      opacity: 1;
      font-weight: 700;
    }
    .gb-student-order-backdrop {
      position: fixed;
      inset: 0;
      z-index: 1300;
      background: rgba(0, 0, 0, .72);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .gb-student-order-dialog {
      width: min(560px, 94vw);
      max-height: min(760px, 88vh);
      display: flex;
      flex-direction: column;
      gap: 12px;
      border-radius: 16px;
      border: 1px solid rgba(255,255,255,.22);
      background: rgba(4, 54, 44, .98);
      color: inherit;
      box-shadow: 0 24px 70px rgba(0,0,0,.45);
      padding: 18px;
    }
    .gb-student-order-dialog h2 {
      margin: 0;
      font-size: 20px;
    }
    .gb-student-order-help {
      margin: 0;
      font-size: 13px;
      opacity: .8;
      line-height: 1.45;
    }
    .gb-student-order-list {
      list-style: none;
      padding: 0;
      margin: 0;
      overflow: auto;
      display: grid;
      gap: 6px;
    }
    .gb-student-order-item {
      display: grid;
      grid-template-columns: 24px minmax(0, 1fr) auto auto;
      align-items: center;
      gap: 8px;
      border: 1px solid rgba(255,255,255,.14);
      border-radius: 10px;
      padding: 8px 10px;
      background: rgba(255,255,255,.05);
    }
    .gb-student-order-item[draggable="true"] { cursor: grab; }
    .gb-student-order-handle {
      opacity: .6;
      font-weight: 800;
      letter-spacing: -2px;
      user-select: none;
    }
    .gb-student-order-code {
      font-weight: 750;
      letter-spacing: .02em;
    }
    .gb-student-order-new {
      margin-left: 8px;
      display: inline-block;
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      border-radius: 999px;
      padding: 2px 6px;
      background: rgba(250, 204, 21, .18);
      border: 1px solid rgba(250, 204, 21, .4);
    }
    .gb-student-order-move {
      min-width: 34px;
      min-height: 32px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,.18);
      background: rgba(255,255,255,.06);
      color: inherit;
      cursor: pointer;
    }
    .gb-student-order-move:disabled {
      opacity: .35;
      cursor: default;
    }
    .gb-student-order-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      flex-wrap: wrap;
    }
  `;
  (root.head || root.documentElement).appendChild(style);
}

function updateMoveButtons(list) {
  const items = Array.from(list.querySelectorAll(".gb-student-order-item"));
  items.forEach((item, index) => {
    const up = item.querySelector('[data-order-action="up"]');
    const down = item.querySelector('[data-order-action="down"]');
    if (up) up.disabled = index === 0;
    if (down) down.disabled = index === items.length - 1;
  });
}

function currentEditorCodes(list) {
  return Array.from(list.querySelectorAll(".gb-student-order-item"))
    .map((item) => String(item.dataset.code || "").trim())
    .filter(Boolean);
}

function closeStudentOrderEditor(root) {
  root.getElementById("gbStudentOrderBackdrop")?.remove();
}

function openStudentOrderEditor(root, className, storage, controls) {
  const search = root.querySelector("#gbStudentSearch");
  if (search && String(search.value || "").trim()) {
    setOrderStatus(
      root,
      controls,
      "Clear the student search before changing class order."
    );
    search.focus();
    return;
  }

  const rows = getStudentRows(root);
  if (!rows.length) {
    setOrderStatus(root, controls, "No students are currently visible.");
    return;
  }

  closeStudentOrderEditor(root);

  const sorted = sortStudentsForGradebookClass(
    className,
    rows.map(({ student }) => student),
    storage
  );
  const saved = getSavedStudentOrder(className, storage);
  const defaultOrder = LOCKED_IC_ROSTER_ORDER[className] || [];
  const knownOrder = saved || defaultOrder;
  const knownCodes = new Set(knownOrder);
  const markNew = knownCodes.size > 0;

  const backdrop = root.createElement("div");
  backdrop.id = "gbStudentOrderBackdrop";
  backdrop.className = "gb-student-order-backdrop";

  const dialog = root.createElement("section");
  dialog.className = "gb-student-order-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "gbStudentOrderTitle");

  const heading = root.createElement("h2");
  heading.id = "gbStudentOrderTitle";
  heading.textContent = `Student Order — ${className}`;

  const help = root.createElement("p");
  help.className = "gb-student-order-help";
  help.textContent =
    "Drag student codes or use the arrow buttons, then save. New students appear at the bottom until you place them. This 2026–27 order is saved only in this browser.";

  const list = root.createElement("ol");
  list.className = "gb-student-order-list";
  list.setAttribute("aria-label", `${className} student order`);

  for (const student of sorted) {
    const code = String(student?.code || "").trim();
    if (!code) continue;

    const item = root.createElement("li");
    item.className = "gb-student-order-item";
    item.draggable = true;
    item.dataset.code = code;

    const handle = root.createElement("span");
    handle.className = "gb-student-order-handle";
    handle.setAttribute("aria-hidden", "true");
    handle.textContent = "⋮⋮";

    const label = root.createElement("span");
    label.className = "gb-student-order-code";
    label.textContent = code;

    if (markNew && !knownCodes.has(code)) {
      const badge = root.createElement("span");
      badge.className = "gb-student-order-new";
      badge.textContent = "New";
      label.appendChild(badge);
    }

    const up = root.createElement("button");
    up.type = "button";
    up.className = "gb-student-order-move";
    up.dataset.orderAction = "up";
    up.setAttribute("aria-label", `Move ${code} up`);
    up.textContent = "↑";

    const down = root.createElement("button");
    down.type = "button";
    down.className = "gb-student-order-move";
    down.dataset.orderAction = "down";
    down.setAttribute("aria-label", `Move ${code} down`);
    down.textContent = "↓";

    item.append(handle, label, up, down);
    list.appendChild(item);
  }

  const actions = root.createElement("div");
  actions.className = "gb-student-order-actions";

  const reset = root.createElement("button");
  reset.type = "button";
  reset.className = "gb-btn";
  reset.dataset.orderDialogAction = "reset";
  reset.textContent = hasLockedInfiniteCampusRoster(className)
    ? "Reset to Infinite Campus Default"
    : "Reset to Default";

  const cancel = root.createElement("button");
  cancel.type = "button";
  cancel.className = "gb-btn";
  cancel.dataset.orderDialogAction = "cancel";
  cancel.textContent = "Cancel";

  const save = root.createElement("button");
  save.type = "button";
  save.className = "gb-btn primary";
  save.dataset.orderDialogAction = "save";
  save.textContent = "Save Order";

  actions.append(reset, cancel, save);
  dialog.append(heading, help, list, actions);
  backdrop.appendChild(dialog);
  (root.body || root.documentElement).appendChild(backdrop);

  updateMoveButtons(list);

  let dragged = null;

  list.addEventListener("click", (event) => {
    const button = event.target.closest("[data-order-action]");
    if (!button) return;

    const item = button.closest(".gb-student-order-item");
    if (!item) return;

    if (button.dataset.orderAction === "up" && item.previousElementSibling) {
      list.insertBefore(item, item.previousElementSibling);
    } else if (
      button.dataset.orderAction === "down" &&
      item.nextElementSibling
    ) {
      list.insertBefore(item.nextElementSibling, item);
    }

    updateMoveButtons(list);
    button.focus();
  });

  list.addEventListener("dragstart", (event) => {
    const item = event.target.closest(".gb-student-order-item");
    if (!item) return;
    dragged = item;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", item.dataset.code || "");
    }
  });

  list.addEventListener("dragend", () => {
    dragged = null;
  });

  list.addEventListener("dragover", (event) => {
    if (!dragged) return;
    const target = event.target.closest(".gb-student-order-item");
    if (!target || target === dragged) return;

    event.preventDefault();
    const rect = target.getBoundingClientRect();
    const before = event.clientY < rect.top + rect.height / 2;
    list.insertBefore(dragged, before ? target : target.nextElementSibling);
    updateMoveButtons(list);
  });

  actions.addEventListener("click", (event) => {
    const button = event.target.closest("[data-order-dialog-action]");
    if (!button) return;

    const action = button.dataset.orderDialogAction;
    if (action === "cancel") {
      closeStudentOrderEditor(root);
      return;
    }

    if (action === "reset") {
      if (!resetStudentOrder(className, storage)) {
        setOrderStatus(root, controls, "Could not reset student order.");
        return;
      }
      closeStudentOrderEditor(root);
      reorderGradebookRows(root, storage);
      refreshStudentOrderControls(root, controls, storage);
      setOrderStatus(
        root,
        controls,
        hasLockedInfiniteCampusRoster(className)
          ? "Infinite Campus default restored."
          : "Default student order restored."
      );
      return;
    }

    if (action === "save") {
      if (!saveStudentOrder(className, currentEditorCodes(list), storage)) {
        setOrderStatus(
          root,
          controls,
          "Could not save student order in this browser."
        );
        return;
      }

      closeStudentOrderEditor(root);
      reorderGradebookRows(root, storage);
      refreshStudentOrderControls(root, controls, storage);
      setOrderStatus(
        root,
        controls,
        "Custom student order saved on this browser.",
        "saved"
      );
    }
  });

  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) closeStudentOrderEditor(root);
  });

  const keyHandler = (event) => {
    if (event.key !== "Escape") return;
    closeStudentOrderEditor(root);
    root.removeEventListener("keydown", keyHandler);
  };
  root.addEventListener("keydown", keyHandler);

  heading.setAttribute("tabindex", "-1");
  heading.focus();
}

function refreshStudentOrderControls(root, controls, storage) {
  const className = getActiveClassName(root);
  const button = controls.querySelector("#gbStudentOrderButton");
  const status = controls.querySelector(".gb-student-order-status");
  const show = Boolean(className && className !== "All Classes");

  controls.hidden = !show;
  if (!show) {
    if (status) status.textContent = "";
    return;
  }

  if (button) {
    button.dataset.className = className;
    button.setAttribute(
      "aria-label",
      `Change student order for ${className}`
    );
  }

  if (status) {
    const custom = getSavedStudentOrder(className, storage);
    status.textContent = custom
      ? "Custom order saved"
      : hasLockedInfiniteCampusRoster(className)
        ? "Infinite Campus default"
        : "Default order";
    status.dataset.tone = custom ? "saved" : "";
  }
}

export function installGradebookStudentOrderControls(
  root = document,
  explicitStorage = null
) {
  const bar = root.querySelector("#classFilterBar");
  if (!bar) return null;

  const existing = root.getElementById("gbStudentOrderControls");
  if (existing) return { controls: existing, observer: null };

  injectStudentOrderStyles(root);

  const storage = resolveStorage(root, explicitStorage);
  const controls = root.createElement("div");
  controls.id = "gbStudentOrderControls";
  controls.className = "gb-student-order-controls";
  controls.hidden = true;

  const button = root.createElement("button");
  button.type = "button";
  button.id = "gbStudentOrderButton";
  button.className = "gb-btn";
  button.textContent = "↕ Student Order";

  const status = root.createElement("span");
  status.className = "gb-student-order-status";
  status.setAttribute("aria-live", "polite");

  controls.append(button, status);
  bar.insertAdjacentElement("afterend", controls);

  button.addEventListener("click", () => {
    const className = getActiveClassName(root);
    if (!className || className === "All Classes") return;
    openStudentOrderEditor(root, className, storage, controls);
  });

  refreshStudentOrderControls(root, controls, storage);

  const Observer =
    root.defaultView?.MutationObserver ||
    (typeof MutationObserver !== "undefined" ? MutationObserver : null);

  const observer = Observer
    ? new Observer(() => {
        refreshStudentOrderControls(root, controls, storage);
      })
    : null;

  observer?.observe(bar, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class"],
  });

  return { controls, observer };
}

export function installGradebookRosterOrder(
  root = document,
  explicitStorage = null
) {
  const body = root.querySelector("#gbTableBody");
  if (!body) return null;

  const storage = resolveStorage(root, explicitStorage);
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      reorderGradebookRows(root, storage);
    });
  };

  const Observer =
    root.defaultView?.MutationObserver ||
    (typeof MutationObserver !== "undefined" ? MutationObserver : null);
  if (!Observer) return null;

  const observer = new Observer(schedule);
  observer.observe(body, { childList: true, subtree: false });
  schedule();
  return observer;
}

if (
  typeof document !== "undefined" &&
  typeof window !== "undefined" &&
  window.location.pathname.startsWith("/teacher/gradebook")
) {
  installGradebookRosterOrder(document);
  installGradebookStudentOrderControls(document);
}

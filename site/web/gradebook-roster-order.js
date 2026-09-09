// Teacher Gradebook roster presentation order for 2026-27.
//
// Student codes only: no names or other PII belong in this file.
// The default gradebook row order mirrors Infinite Campus for each class.
// Explicit teacher column sorts still win; clearing a column sort restores this order.

export const INFINITE_CAMPUS_ROSTER_ORDER = Object.freeze({
  "Language Arts 3 SC": Object.freeze([
    "S057", "S019", "S069", "S023", "S070", "S040", "S033", "S036"
  ]),
  "Language Arts 4 SC": Object.freeze([
    "S016", "S031", "S003", "S004", "S039", "S009"
  ]),
  "Life Skills Language Arts SC": Object.freeze([
    "S015", "S059", "S017", "S018", "S073", "S020", "S058"
  ]),
  "Language Arts 1 SC": Object.freeze([
    "S062", "S049", "S071", "S063", "S060", "S064", "S056", "S067",
    "S055", "S052", "S061", "S065", "S053", "S041", "S072", "S054",
    "S051"
  ]),
  "Language Arts 2 SC": Object.freeze([
    "S025", "S047", "S048", "S040", "S026", "S042", "S066", "S041",
    "S074", "S028", "S036"
  ]),
  "Transitional Skills": Object.freeze([
    "S015", "S059", "S017", "S018", "S031", "S003", "S073", "S020",
    "S004", "S006", "S058", "S008", "S009"
  ])
});

export function sortStudentCodesForClass(codes, className) {
  const safeCodes = Array.isArray(codes) ? [...codes] : [];
  const configuredOrder = INFINITE_CAMPUS_ROSTER_ORDER[className];
  if (!configuredOrder) return safeCodes;

  const rank = new Map(configuredOrder.map((code, index) => [code, index]));
  const originalRank = new Map(safeCodes.map((code, index) => [code, index]));

  return safeCodes.sort((a, b) => {
    const aRank = rank.has(a) ? rank.get(a) : Number.MAX_SAFE_INTEGER;
    const bRank = rank.has(b) ? rank.get(b) : Number.MAX_SAFE_INTEGER;
    if (aRank !== bRank) return aRank - bRank;

    // Future/unconfigured students remain at the bottom in their existing order.
    return (originalRank.get(a) ?? 0) - (originalRank.get(b) ?? 0);
  });
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

function getStudentCodeFromRow(row) {
  const cell = row.querySelector(".gb-student-cell");
  const raw = cell?.dataset?.tooltip;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return typeof parsed?.code === "string" ? parsed.code : null;
  } catch {
    return null;
  }
}

export function reorderGradebookRows(root = document) {
  const className = getActiveClassName(root);
  if (!INFINITE_CAMPUS_ROSTER_ORDER[className]) return false;
  if (hasExplicitColumnSort(root)) return false;

  const body = root.querySelector("#gbTableBody");
  if (!body) return false;

  const studentRows = Array.from(body.querySelectorAll("tr")).filter(
    (row) => !row.classList.contains("gb-summary-row") && getStudentCodeFromRow(row)
  );
  if (studentRows.length < 2) return false;

  const currentCodes = studentRows.map(getStudentCodeFromRow);
  const targetCodes = sortStudentCodesForClass(currentCodes, className);
  const rowsByCode = new Map(studentRows.map((row) => [getStudentCodeFromRow(row), row]));
  const alreadyOrdered = currentCodes.every((code, index) => code === targetCodes[index]);

  if (alreadyOrdered) return false;

  const summaryRow = body.querySelector("tr.gb-summary-row");
  for (const code of targetCodes) {
    const row = rowsByCode.get(code);
    if (row) body.insertBefore(row, summaryRow || null);
  }

  for (const row of studentRows) row.classList.remove("gb-highlighted");
  const firstStudentRow = targetCodes.length ? rowsByCode.get(targetCodes[0]) : null;
  if (firstStudentRow) firstStudentRow.classList.add("gb-highlighted");

  return true;
}

export function installGradebookRosterOrder(root = document) {
  if (typeof MutationObserver === "undefined") return null;
  const body = root.querySelector("#gbTableBody");
  if (!body) return null;

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      reorderGradebookRows(root);
    });
  };

  const observer = new MutationObserver(schedule);
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
}

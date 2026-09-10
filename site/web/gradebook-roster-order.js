// Teacher Gradebook roster presentation order.
//
// The six current 2026–27 classroom rosters use an explicit pseudonymous
// student-code stack captured from Infinite Campus. Those code-only sequences
// are the source of truth for grade-entry order and contain no student names.
//
// Locked class rosters always win over Gradebook column sorting so the vertical
// student stack does not move while a teacher transfers grades. Unknown/new
// student codes are placed after the locked roster in deterministic code order
// until the roster map is deliberately updated. Other classes retain the prior
// family-name fallback behavior.

const NAME_COLLATOR = new Intl.Collator("en-US", {
  sensitivity: "base",
  numeric: true,
});

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

export function hasLockedInfiniteCampusRoster(className) {
  return Object.prototype.hasOwnProperty.call(
    LOCKED_IC_ROSTER_ORDER,
    String(className || "").trim()
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

export function sortStudentsByLockedInfiniteCampusOrder(className, students) {
  const safeStudents = Array.isArray(students) ? [...students] : [];
  const lockedCodes = LOCKED_IC_ROSTER_ORDER[String(className || "").trim()];
  if (!lockedCodes) return sortStudentsLikeInfiniteCampus(safeStudents);

  const rankByCode = new Map(
    lockedCodes.map((code, index) => [code, index])
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

      // New/unmapped students remain visible after the locked roster and are
      // deterministic until the source-of-truth sequence is deliberately updated.
      const byCode = NAME_COLLATOR.compare(aCode, bCode);
      if (byCode !== 0) return byCode;

      return a.index - b.index;
    })
    .map(({ student }) => student);
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

export function reorderGradebookRows(root = document) {
  const className = getActiveClassName(root);
  if (!className || className === "All Classes") return false;

  const isLockedRoster = hasLockedInfiniteCampusRoster(className);
  // For the six locked grade-entry rosters, the Infinite Campus stack is
  // authoritative even when a Gradebook column has an active sort indicator.
  // Unlocked classes preserve the older behavior where explicit teacher sorts win.
  if (!isLockedRoster && hasExplicitColumnSort(root)) return false;

  const body = root.querySelector("#gbTableBody");
  if (!body) return false;

  const studentRows = Array.from(body.querySelectorAll("tr"))
    .filter((row) => !row.classList.contains("gb-summary-row"))
    .map((row) => ({ row, student: getStudentFromRow(row) }))
    .filter(({ student }) => student);

  if (studentRows.length < 2) return false;

  const target = isLockedRoster
    ? sortStudentsByLockedInfiniteCampusOrder(
        className,
        studentRows.map(({ student }) => student)
      )
    : sortStudentsLikeInfiniteCampus(
        studentRows.map(({ student }) => student)
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
  const firstStudentRow = targetCodes.length ? rowByCode.get(targetCodes[0]) : null;
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

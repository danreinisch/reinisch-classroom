// Teacher Gradebook roster presentation order.
//
// Infinite Campus is stacking the class rosters alphabetically by student name.
// Reinisch Classroom already has the display name at runtime, so this helper
// sorts the rendered rows the same way instead of hard-coding a roster.
// No student names or other PII are stored in source.
// Explicit teacher column sorts still win; clearing a sort restores this order.

const NAME_COLLATOR = new Intl.Collator("en-US", {
  sensitivity: "base",
  numeric: true,
});

function studentSortLabel(student) {
  return String(student?.name || student?.code || "").trim();
}

export function sortStudentsLikeInfiniteCampus(students) {
  const safeStudents = Array.isArray(students) ? [...students] : [];

  return safeStudents
    .map((student, index) => ({ student, index }))
    .sort((a, b) => {
      const byName = NAME_COLLATOR.compare(
        studentSortLabel(a.student),
        studentSortLabel(b.student)
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
  if (hasExplicitColumnSort(root)) return false;

  const body = root.querySelector("#gbTableBody");
  if (!body) return false;

  const studentRows = Array.from(body.querySelectorAll("tr"))
    .filter((row) => !row.classList.contains("gb-summary-row"))
    .map((row) => ({ row, student: getStudentFromRow(row) }))
    .filter(({ student }) => student);

  if (studentRows.length < 2) return false;

  const target = sortStudentsLikeInfiniteCampus(
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

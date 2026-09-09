// Shared constants for Teacher Center modules
// Full class names matching database class_id values.
// Used by tc-review.js, tc-gradebook.js.
// NOTE: tc-work.js defines its own local copy (non-module file).
export const CANON_CLASSES = [
  "Language Arts 1 SC",
  "Language Arts 2 SC",
  "Language Arts 3 SC",
  "Language Arts 4 SC",
  "Life Skills Language Arts SC",
  "Transitional Skills",
  "Consumer Math",
  "Geometry SC",
  "Speech/Language",
  "Warrior Academy"
];

/** Display abbreviations for class filter buttons and space-constrained UI. */
export const CLASS_DISPLAY = {
  "Language Arts 1 SC": "LA 1",
  "Language Arts 2 SC": "LA 2",
  "Language Arts 3 SC": "LA 3",
  "Language Arts 4 SC": "LA 4",
  "Life Skills Language Arts SC": "LS LA",
  "Transitional Skills": "Transitional Skills",
  "Life Skills": "Transitional Skills",
  "Consumer Math": "Consumer Math",
  "Geometry SC": "Geometry",
  "Speech/Language": "Speech/Lang",
  "Warrior Academy": "Warrior"
};

/**
 * Return the display abbreviation for a class name, or the full name if no abbreviation exists.
 * @param {string} className
 * @returns {string}
 */
export function getClassDisplayName(className) {
  return CLASS_DISPLAY[className] ?? className;
}

// Gradebook-only presentation bootstrap. The roster-order module uses student
// codes only and reorders rendered gradebook rows to mirror Infinite Campus.
// Other Teacher Center pages importing constants.js do not load it.
if (
  typeof window !== "undefined" &&
  window.location.pathname.startsWith("/teacher/gradebook")
) {
  import("/web/gradebook-roster-order.js?v=20260909-ic-order").catch((error) => {
    console.warn("[gradebook] Could not load roster-order helper:", error);
  });
}

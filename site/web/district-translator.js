/**
 * district-translator.js
 *
 * Client-side only module for translating Student Code Names (S001, S002, …)
 * to real student names for district reporting.
 *
 * PRIVACY / FERPA REQUIREMENTS:
 *  - Real names are stored ONLY in this module-scoped variable (runtime memory).
 *  - Real names are NEVER written to localStorage, sessionStorage, IndexedDB,
 *    cookies, or any server endpoint.
 *  - The roster is lost automatically when the page is closed or refreshed.
 */

// Module-scoped roster — only exists in JS runtime memory.
// Map<string, string>  e.g.  "S001" -> "John Smith"
let _rosterMap = new Map();

/**
 * Parse a roster CSV string and populate the in-memory map.
 *
 * Expected CSV format (header row required):
 *   Student Code,Real Name
 *   S001,John Smith
 *   S002,Jane Doe
 *
 * @param {string} csvText  Raw text content of the roster CSV file.
 * @returns {number}        Number of student entries loaded.
 */
export function loadRoster(csvText) {
  _rosterMap = new Map();

  const lines = csvText.split(/\r?\n/);
  // Skip the header row (first non-empty line)
  let headerSkipped = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (!headerSkipped) {
      headerSkipped = true;
      // Skip the header regardless of its exact text
      continue;
    }

    // Split on the first comma only to allow commas inside names
    const commaIdx = line.indexOf(',');
    if (commaIdx === -1) continue;

    const code = line.slice(0, commaIdx).trim().toUpperCase();
    // Strip surrounding quotes if present
    let name = line.slice(commaIdx + 1).trim();
    if (name.startsWith('"') && name.endsWith('"')) {
      name = name.slice(1, -1).replace(/""/g, '"');
    }

    if (code && name) {
      _rosterMap.set(code, name);
    }
  }

  return _rosterMap.size;
}

/**
 * Clear the in-memory roster.
 */
export function clearRoster() {
  _rosterMap = new Map();
}

/**
 * Returns true when at least one student entry has been loaded.
 * @returns {boolean}
 */
export function isRosterLoaded() {
  return _rosterMap.size > 0;
}

/**
 * Returns the number of students currently in the roster.
 * @returns {number}
 */
export function getRosterCount() {
  return _rosterMap.size;
}

/**
 * Replace all student code names in a text string with real names.
 *
 * Rules:
 *  - Longest codes are matched first to prevent S001 matching inside S0011.
 *  - Word-boundary matching (\b) prevents replacing S001 inside AS001X.
 *  - Case-insensitive: s001 and S001 both match.
 *
 * @param {string} inputText  Any text content (CSV, narrative, HTML, etc.)
 * @returns {string}          Translated text.
 */
export function translateText(inputText) {
  if (!isRosterLoaded() || !inputText) return inputText;

  // Sort codes longest-first so S0011 is replaced before S001
  const codes = Array.from(_rosterMap.keys()).sort((a, b) => b.length - a.length);

  if (codes.length === 0) return inputText;

  // Build a single regex with all codes joined by |
  // Escape any regex-special chars in the code (codes are alphanumeric, but be safe)
  const escaped = codes.map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');

  return inputText.replace(pattern, (match) => {
    return _rosterMap.get(match.toUpperCase()) || match;
  });
}

/**
 * Translate text content and trigger a browser download of the result.
 *
 * @param {string} content   Raw text/CSV/HTML content to translate.
 * @param {string} filename  Suggested download filename.
 * @param {string} mimeType  MIME type for the download (e.g. 'text/csv').
 */
export function translateAndDownload(content, filename, mimeType) {
  const translated = translateText(content);
  const blob = new Blob([translated], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

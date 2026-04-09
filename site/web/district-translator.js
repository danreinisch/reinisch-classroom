/**
 * district-translator.js — Client-side Student Code Name ↔ Real Name translator
 *
 * All translation happens 100% in the browser. Real names are never sent to any
 * server and never stored in localStorage or sessionStorage (FERPA compliance).
 *
 * Usage:
 *   import { loadRoster, clearRoster, isRosterLoaded, getRosterCount,
 *            translateText, translateAndDownload } from '/web/district-translator.js';
 */

// Module-scoped roster map: { "S001": "Jane Smith", ... }
// Cleared on module reload (i.e., page navigation / refresh).
const _rosterMap = new Map();

/**
 * Parse a roster CSV string and populate the internal map.
 * Expects two columns: code, real_name (header row optional).
 * Clears any previously loaded roster first.
 *
 * @param {string} csvText - Raw CSV content with code→name pairs
 * @returns {number} Number of entries loaded
 */
export function loadRoster(csvText) {
  _rosterMap.clear();
  const lines = csvText.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const commaIdx = trimmed.indexOf(',');
    if (commaIdx === -1) continue;
    const code = trimmed.slice(0, commaIdx).trim().replace(/^"|"$/g, '').toUpperCase();
    const name = trimmed.slice(commaIdx + 1).trim().replace(/^"|"$/g, '');
    if (!code || !name) continue;
    // Skip header row (code column that looks like a header)
    if (code === 'CODE' || code === 'STUDENT CODE' || code === 'STUDENT_CODE') continue;
    _rosterMap.set(code, name);
  }
  return _rosterMap.size;
}

/**
 * Clear the currently loaded roster from memory.
 */
export function clearRoster() {
  _rosterMap.clear();
}

/**
 * @returns {boolean} Whether a roster is currently loaded
 */
export function isRosterLoaded() {
  return _rosterMap.size > 0;
}

/**
 * @returns {number} Number of student entries in the current roster
 */
export function getRosterCount() {
  return _rosterMap.size;
}

/**
 * Replace all student code names in inputText with real names.
 * Uses longest-match-first ordering (e.g. S0011 before S001) and
 * word-boundary matching so codes embedded in other strings are not replaced.
 *
 * @param {string} inputText - Text containing student codes to translate
 * @returns {string} Text with codes replaced by real names
 */
export function translateText(inputText) {
  if (!_rosterMap.size) return inputText;

  // Sort codes longest-first to prevent S001 matching inside S0011
  const codes = [..._rosterMap.keys()].sort((a, b) => b.length - a.length);

  // Build a single regex with word boundaries, case-insensitive
  const escaped = codes.map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');

  return inputText.replace(pattern, (match) => {
    return _rosterMap.get(match.toUpperCase()) || match;
  });
}

/**
 * Translate content and trigger a browser download of the result.
 *
 * @param {string} content - Text content to translate and download
 * @param {string} filename - Filename for the download (e.g. "report_district.csv")
 * @param {string} mimeType - MIME type (e.g. "text/csv;charset=utf-8;")
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

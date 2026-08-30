/* eslint-env node, browser */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    // Browser: attach to window so tc-work.js can reference rcParseStudentSections
    root.rcParseStudentSections = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function parseStudentSections(text) {
    const lines = String(text || '').split(/\r?\n/);
    const isSep = (ln) => /^\s*={3,}\s*$/.test(ln);

    const sections = [];
    let i = 0;

    while (i < lines.length) {
      if (!isSep(lines[i])) { i++; continue; }

      // Find the separator that closes the header block (separates header from content)
      let sepEnd = -1;
      for (let k = i + 1; k < lines.length; k++) {
        if (isSep(lines[k])) { sepEnd = k; break; }
      }
      if (sepEnd === -1) { i++; continue; }

      // Priority: "Assignment:" is checked before "Student:" in the search order.
      // If a header block contains "Assignment: SXXX", it will always be used, even
      // if a "Student:" line also appears. This preserves backward compatibility with
      // the legacy format.
      let studentCode = null;
      let cls = '';

      // Preserve the teacher-authored WEEK title from this student's
      // header block when present. Older individualized formats may omit it.
      const title =
        lines
          .slice(i + 1, sepEnd)
          .map(line => line.trim())
          .find(line => /^WEEK\s+\d+\b/i.test(line)) || '';
      for (let k = i + 1; k < sepEnd; k++) {
        const line = lines[k].trim();
        if (!line) continue;

        const assignMatch = line.match(/^Assignment\s*:\s*(\S+)/i);
        if (assignMatch) {
          studentCode = assignMatch[1].trim();
          // Look for "Class: ..." on following lines within the header block
          for (let m = k + 1; m < sepEnd; m++) {
            const clsMatch = lines[m].trim().match(/^Class\s*:\s*(.+)/i);
            if (clsMatch) { cls = clsMatch[1].trim(); break; }
          }
          break;
        }

        // (\S+) stops at the first whitespace; the full `line` is reused below to
        // extract the "| Class: ..." portion that follows the student code.
        const studentMatch = line.match(/^Student\s*:\s*(\S+)/i);
        if (studentMatch) {
          studentCode = studentMatch[1].trim();
          // Try "| Class: ..." on the same line first
          const clsSameLine = line.match(/\|\s*Class\s*:\s*(.+)/i);
          if (clsSameLine) {
            cls = clsSameLine[1].trim();
          } else {
            // Fall back to a separate "Class: ..." line within the header block
            for (let m = k + 1; m < sepEnd; m++) {
              const clsMatch = lines[m].trim().match(/^Class\s*:\s*(.+)/i);
              if (clsMatch) { cls = clsMatch[1].trim(); break; }
            }
          }
          break;
        }
      }
      if (!studentCode) { i++; continue; }

      // Find the separator that ends the content block (start of next student section)
      let bodyEnd = lines.length;
      for (let k = sepEnd + 1; k < lines.length; k++) {
        if (isSep(lines[k])) { bodyEnd = k; break; }
      }
      const fullBody = lines.slice(sepEnd + 1, bodyEnd).join('\n').trim();

      sections.push({
        studentCode,
        className: cls,
        ...(title ? { title } : {}),
        body: fullBody
      });

      // Advance past the body end to avoid re-scanning body content (performance fix)
      i = bodyEnd;
    }

    return sections;
  }

  return parseStudentSections;
});

(function () {
  "use strict";

  function uniq(arr) {
    return Array.from(new Set((arr || []).map(String).map((s) => s.trim()).filter(Boolean)));
  }

  function splitCodes(s) {
    return String(s || "")
      .split(/[,;]+/g)
      .map((x) => x.trim())
      .filter(Boolean);
  }

  // Parses tags like [[DESE:RL.9-10.1]] [[IEP:IG:D.H.12.1]]
  // Returns { cleanText, tags: { dese:[], iep:[] }, matches:[] }
  function rcParseAssignmentTags(text) {
    const raw = String(text || "");
    const re = /\[\[\s*(DESE|IEP)\s*:\s*([^\]]+?)\s*\]\]/gi;

    const dese = [];
    const iep = [];
    const matches = [];

    let m;
    while ((m = re.exec(raw))) {
      const kind = String(m[1] || "").toUpperCase();
      const payload = String(m[2] || "");
      const codes = splitCodes(payload);

      matches.push({ kind, raw: m[0], payload, codes });

      if (kind === "DESE") dese.push(...codes);
      if (kind === "IEP") iep.push(...codes);
    }

    // Remove tags, then tidy whitespace per-line (keep newlines)
    const cleanText = raw
      .replace(re, "")
      .split("\n")
      .map((ln) => ln.replace(/[ \t]+$/g, ""))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return { cleanText, tags: { dese: uniq(dese), iep: uniq(iep) }, matches };
  }

  window.rcParseAssignmentTags = rcParseAssignmentTags;
})();

(function () {
  function uniqSorted(xs) {
    return Array.from(new Set(xs.map(String))).filter(Boolean).sort();
  }

  function parse(text) {
    const src = String(text || "");
    const tags = { dese: [], iep: [] };

    const re = /\[\[\s*(DESE|IEP)\s*:\s*([^\]]+?)\s*\]\]/gi;

    let m;
    while ((m = re.exec(src)) !== null) {
      const kind = String(m[1] || "").toLowerCase();
      const raw = String(m[2] || "");
      const parts = raw.split(",").map((x) => x.trim()).filter(Boolean);
      if (kind === "dese") tags.dese.push(...parts);
      if (kind === "iep") tags.iep.push(...parts);
    }

    // Reset lastIndex before reuse (paranoia that pays rent)
    re.lastIndex = 0;
    const cleanText = src.replace(re, "").replace(/[ \t]+\n/g, "\n").trim();

    tags.dese = uniqSorted(tags.dese);
    tags.iep = uniqSorted(tags.iep);

    return { cleanText, tags };
  }

  window.rcParseAssignmentTags = parse;
})();

'use strict';

/**
 * parse-html-assignment.js
 *
 * Regex-based HTML assignment parser for Node.js (no DOMParser available in
 * Netlify Functions).  Extracts question metadata from data-* attributes so
 * that buildItemsFromMeta() Path B can create assignment_items rows.
 *
 * Supported patterns (all use data-qref on .q-card elements):
 *   Pattern 1 – Counting Money (data-iep, constructed, data-correct="X.XX" on .q-card)
 *   Pattern 2 – S015 Reading a Recipe (data-goal, opt-btn with boolean
 *               data-correct attribute on the correct answer button)
 *   Pattern 3 – S020 Match the Items (data-goal, category-group div with
 *               data-correct="value" attribute)
 *
 * Embedded JSON manifest (Step 0 / highest priority):
 *   If the HTML file contains a <script type="application/json"
 *   id="assignment-manifest"> block, its JSON is parsed and used as the
 *   authoritative source of item metadata, bypassing regex extraction.
 *   Expected JSON schema:
 *     {
 *       "questions": [
 *         {
 *           "ref":        "D1Q1",          // required (also accept "q_ref")
 *           "label":      "Count 4 quarters",
 *           "answer_type": "constructed",
 *           "correct":    "1.00",
 *           "goal_codes": ["S008.11.1"],   // array, not semicolon-delimited
 *           "dese_codes": ["MLS.5.1"],     // array
 *           "points":     1
 *         }
 *       ]
 *     }
 *   If the manifest is absent, malformed, or has an empty questions array,
 *   the parser falls back to regex extraction (existing behaviour).
 *
 * Returns { questions: Array } where each question object has the fields
 * expected by buildItemsFromMeta() Path B:
 *   q_ref, label, default_goal_codes, default_dese_codes, answer_type, points, correct
 */

/**
 * Decode common HTML character references in a single pass, preventing any
 * chance of double-unescaping (e.g. &amp;lt; should become &lt;, not <).
 * @param {string} str
 * @returns {string}
 */
function decodeHtmlEntities(str) {
  if (!str) return str;
  var ENTITIES = {
    '&amp;':   '&',
    '&lt;':    '<',
    '&gt;':    '>',
    '&quot;':  '"',
    '&apos;':  "'",
    '&#8211;': '\u2013',
    '&#8212;': '\u2014',
    '&#8217;': '\u2019',
    '&#8216;': '\u2018',
    '&#160;':  '\u00a0',
  };
  // Single-pass: match named entities and decimal numeric references.
  return str.replace(/&(?:[a-zA-Z]+|#\d+);/g, function (entity) {
    if (Object.prototype.hasOwnProperty.call(ENTITIES, entity)) {
      return ENTITIES[entity];
    }
    var numMatch = /^&#(\d+);$/.exec(entity);
    if (numMatch) {
      return String.fromCharCode(parseInt(numMatch[1], 10));
    }
    return entity;
  });
}

/**
 * Escape special regex metacharacters in a string so it can be safely
 * embedded inside a RegExp pattern.
 * @param {string} s
 * @returns {string}
 */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract the value of a named attribute from an HTML opening tag string.
 * Returns null if the attribute is absent.
 * @param {string} tag  e.g. '<div class="q-card" data-qref="D1Q1" ...>'
 * @param {string} attr attribute name (e.g. 'data-goal')
 * @returns {string|null}
 */
function extractAttr(tag, attr) {
  // Match: attr="value" or attr='value'
  var re = new RegExp('\\b' + escapeRegExp(attr) + '=["\']([^"\']*)["\']', 'i');
  var m = re.exec(tag);
  return m ? m[1] : null;
}

/**
 * Normalise the data-answer-type value to the canonical DB answer_type.
 * @param {string} raw
 * @returns {string}
 */
function normalizeAnswerType(raw) {
  switch ((raw || '').toLowerCase()) {
    case 'multiple-choice': return 'mcq';
    case 'multiple_choice': return 'mcq';
    case 'mcq':             return 'mcq';
    case 'constructed-response': return 'constructed';
    case 'constructed':     return 'constructed';
    case 'multi':           return 'multi';
    case 'boolean':         return 'boolean';
    default:                return 'constructed';
  }
}

/**
 * Parse an HTML assignment file and extract questions from data-qref elements.
 *
 * @param {string} htmlText  Raw HTML content of the assignment file
 * @returns {{ questions: Array }}  Ready for buildItemsFromMeta() Path B
 */
function parseHtmlAssignment(htmlText) {
  if (!htmlText || typeof htmlText !== 'string') {
    return { questions: [] };
  }

  // ── Step 0: check for embedded JSON manifest ──────────────────────────────
  // If the HTML contains <script type="application/json" id="assignment-manifest">,
  // use it as the authoritative source of question metadata.
  // Match any <script> block then check both required attributes independently,
  // so attribute order does not matter. The closing tag pattern allows optional
  // whitespace before '>' to handle all valid HTML forms (e.g. </script >).
  var scriptTagPattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  var manifestContent = null;
  var scriptMatch;
  while ((scriptMatch = scriptTagPattern.exec(htmlText)) !== null) {
    var scriptAttrs = scriptMatch[1];
    if (/\btype\s*=\s*["']application\/json["']/i.test(scriptAttrs) &&
        /\bid\s*=\s*["']assignment-manifest["']/i.test(scriptAttrs)) {
      manifestContent = scriptMatch[2];
      break;
    }
  }

  if (manifestContent !== null) {
    try {
      var manifest = JSON.parse(manifestContent);
      if (manifest && Array.isArray(manifest.questions) && manifest.questions.length > 0) {
        var manifestQuestions = [];
        var seenManifestRefs = {};
        for (var j = 0; j < manifest.questions.length; j++) {
          var mq = manifest.questions[j];
          var ref = mq.ref || mq.q_ref;
          if (!ref) {
            ref = 'Q' + (j + 1);
            console.warn('assignment-manifest question at index ' + j + ' is missing required ref/q_ref — using fallback: ' + ref + '. Add a ref or q_ref field to fix this warning.');
          }
          if (seenManifestRefs[ref]) {
            console.warn('Duplicate ref in manifest: ' + ref + ' — skipping');
            continue;
          }
          seenManifestRefs[ref] = true;
          manifestQuestions.push({
            q_ref:              ref,
            label:              mq.label || ref,
            default_goal_codes: Array.isArray(mq.goal_codes) ? mq.goal_codes : [],
            default_dese_codes: Array.isArray(mq.dese_codes) ? mq.dese_codes : [],
            answer_type:        normalizeAnswerType(mq.answer_type || ''),
            points:             (typeof mq.points === 'number') ? mq.points : 1,
            correct:            (mq.correct == null) ? null : mq.correct,
          });
        }
        console.log('Parsed ' + manifestQuestions.length + ' question(s) from embedded assignment-manifest');
        return { questions: manifestQuestions };
      }
    } catch (e) {
      console.warn('Failed to parse embedded assignment-manifest JSON — falling back to regex extraction:', e.message);
    }
  }

  // ── Step 1 (regex fallback): find every opening tag with data-qref ─────────
  // We capture the full opening tag so we can extract sibling attributes.
  // seenQrefs tracks already-processed q_ref values to deduplicate: if an HTML
  // file has two elements with the same data-qref, only the first is kept.
  var questions = [];
  var seenQrefs = {};
  var qCardTagPattern = /<[a-z][a-z0-9]*\b([^>]*\bdata-qref="([^"]+)"[^>]*)>/gi;

  var allMatches = [];
  var tagMatch;
  while ((tagMatch = qCardTagPattern.exec(htmlText)) !== null) {
    var qrefValue = tagMatch[2];
    if (seenQrefs[qrefValue]) {
      console.warn('Duplicate data-qref found: ' + qrefValue + ' — skipping');
      continue;
    }
    seenQrefs[qrefValue] = true;
    allMatches.push({
      qref:     qrefValue,
      openTag:  tagMatch[0],   // the full opening tag
      tagStart: tagMatch.index,
      tagEnd:   tagMatch.index + tagMatch[0].length,
    });
  }

  // ── Step 2: for each q-card, examine the HTML slice up to the next q-card ──
  for (var i = 0; i < allMatches.length; i++) {
    var m = allMatches[i];
    var contentEnd = (i + 1 < allMatches.length)
      ? allMatches[i + 1].tagStart
      : htmlText.length;
    var content = htmlText.slice(m.tagEnd, contentEnd);

    // -- Attributes from the opening tag --
    var openTag = m.openTag;

    // Goal codes: prefer data-goal, fall back to data-iep
    var goalRaw = extractAttr(openTag, 'data-goal') || extractAttr(openTag, 'data-iep') || '';
    var default_goal_codes = goalRaw
      ? goalRaw.split(/[;,]/).map(function (s) { return s.trim(); }).filter(Boolean)
      : [];

    // DESE standard codes
    var deseRaw = extractAttr(openTag, 'data-dese') || '';
    var default_dese_codes = deseRaw
      ? deseRaw.split(/[;,]/).map(function (s) { return s.trim(); }).filter(Boolean)
      : [];

    // Answer type
    var rawAnswerType = extractAttr(openTag, 'data-answer-type') || '';
    var answer_type = normalizeAnswerType(rawAnswerType);

    // Points
    var pointsStr = extractAttr(openTag, 'data-points') || '1';
    var points = parseInt(pointsStr, 10);
    if (isNaN(points) || points < 1) points = 1;

    // -- Correct answer from child elements --
    var correct = null;

    if (answer_type === 'mcq') {
      // Pattern 2 (S015): boolean data-correct attribute on an opt-btn button
      // e.g. <button class="opt-btn" type="button" data-correct>c) Text</button>
      var buttonPattern = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
      var btnMatch;
      var foundOptBtn = false;
      while ((btnMatch = buttonPattern.exec(content)) !== null) {
        var btnAttrs = btnMatch[1];
        var btnText  = btnMatch[2];
        // Must have opt-btn class AND data-correct WITHOUT an = sign after it
        if (/\bopt-btn\b/.test(btnAttrs)
            && /\bdata-correct\b/.test(btnAttrs)
            && !/\bdata-correct\s*=/.test(btnAttrs)) {
          correct = decodeHtmlEntities(btnText.trim());
          foundOptBtn = true;
          break;
        }
      }

      if (!foundOptBtn) {
        // Pattern 3 (S020): data-correct="value" on a category-group element
        // e.g. <div class="category-group" data-correct="Kitchen">
        var catMatch = /\bdata-correct="([^"]+)"/.exec(content);
        if (catMatch) {
          correct = catMatch[1];
        }
      }
    } else if (answer_type === 'constructed') {
      // Pattern 1 (Counting Money): data-correct="value" on the .q-card element itself
      // e.g. <div class="q-card" data-qref="D1Q1" ... data-correct="1.00">
      var cardCorrect = extractAttr(openTag, 'data-correct');
      if (cardCorrect !== null) {
        correct = cardCorrect;
      }
    }

    questions.push({
      q_ref:              m.qref,
      label:              m.qref,
      default_goal_codes: default_goal_codes,
      default_dese_codes: default_dese_codes,
      answer_type:        answer_type,
      points:             points,
      correct:            correct,
    });
  }

  return { questions: questions };
}

module.exports = { parseHtmlAssignment, decodeHtmlEntities, extractAttr, escapeRegExp };

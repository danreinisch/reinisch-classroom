/**
 * tc-district-export.js
 *
 * Initialises the District Export page UI.
 * Delegates all translation work to district-translator.js.
 *
 * PRIVACY: This module never sends student name data to any server.
 * All processing is 100 % client-side in the browser.
 */
import {
  loadRoster,
  clearRoster,
  isRosterLoaded,
  getRosterCount,
  translateText,
  translateAndDownload,
} from '/web/district-translator.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function $(id) {
  return document.getElementById(id);
}

function updateRosterStatus() {
  const statusEl = $('deRosterStatus');
  if (!statusEl) return;
  if (isRosterLoaded()) {
    statusEl.textContent = `✅ ${getRosterCount()} students loaded`;
    statusEl.className = 'de-roster-status loaded';
  } else {
    statusEl.textContent = 'No roster loaded';
    statusEl.className = 'de-roster-status empty';
  }
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

// Detect whether content looks like CSV (has commas + newlines)
function looksLikeCSV(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return false;
  return lines[0].includes(',');
}

// ── State ─────────────────────────────────────────────────────────────────────

let _translatedFileContent = null;
let _translatedFileName = null;
let _translatedFileMime = null;

// ── Init ──────────────────────────────────────────────────────────────────────

function init() {
  // ── Roster upload ──
  const loadRosterBtn = $('deLoadRosterBtn');
  const clearRosterBtn = $('deClearRosterBtn');
  const rosterFileInput = $('deRosterFile');

  if (loadRosterBtn) {
    loadRosterBtn.addEventListener('click', async () => {
      const file = rosterFileInput && rosterFileInput.files && rosterFileInput.files[0];
      if (!file) {
        alert('Please choose a roster CSV file first.');
        return;
      }
      try {
        const text = await readFileAsText(file);
        const count = loadRoster(text);
        if (count === 0) {
          alert('No students were loaded. Check that your CSV has a header row and at least one data row.');
        }
        updateRosterStatus();
      } catch (err) {
        console.error('[tc-district-export] Failed to load roster:', err);
        alert('Failed to read roster file: ' + err.message);
      }
    });
  }

  if (clearRosterBtn) {
    clearRosterBtn.addEventListener('click', () => {
      clearRoster();
      if (rosterFileInput) rosterFileInput.value = '';
      updateRosterStatus();
    });
  }

  // ── Text translator ──
  const translateBtn = $('deTranslateBtn');
  const inputTextEl = $('deInputText');
  const outputTextEl = $('deOutputText');
  const copyOutputBtn = $('deCopyOutputBtn');
  const downloadCsvBtn = $('deDownloadCsvBtn');

  if (translateBtn) {
    translateBtn.addEventListener('click', () => {
      if (!isRosterLoaded()) {
        alert('Please load a roster first (Step 1).');
        return;
      }
      const input = inputTextEl ? inputTextEl.value : '';
      if (!input.trim()) {
        alert('Please paste some text to translate.');
        return;
      }
      const output = translateText(input);
      if (outputTextEl) outputTextEl.value = output;

      // Show Download as CSV button if output looks like CSV
      if (downloadCsvBtn) {
        downloadCsvBtn.style.display = looksLikeCSV(output) ? '' : 'none';
      }
    });
  }

  if (copyOutputBtn) {
    copyOutputBtn.addEventListener('click', () => {
      const text = outputTextEl ? outputTextEl.value : '';
      if (!text) {
        alert('Nothing to copy — translate some content first.');
        return;
      }
      navigator.clipboard.writeText(text).then(() => {
        const orig = copyOutputBtn.textContent;
        copyOutputBtn.textContent = '✅ Copied!';
        setTimeout(() => { copyOutputBtn.textContent = orig; }, 2000);
      }).catch(() => {
        alert('Failed to copy to clipboard.');
      });
    });
  }

  if (downloadCsvBtn) {
    downloadCsvBtn.addEventListener('click', () => {
      const text = outputTextEl ? outputTextEl.value : '';
      if (!text) return;
      translateAndDownload(text, 'translated_district.csv', 'text/csv;charset=utf-8;');
    });
  }

  // ── File translator ──
  const fileInput = $('deFileInput');
  const translateFileBtn = $('deTranslateFileBtn');
  const fileDownloadRow = $('deFileDownloadRow');
  const fileReadyMsg = $('deFileReadyMsg');
  const downloadFileBtn = $('deDownloadFileBtn');

  if (translateFileBtn) {
    translateFileBtn.addEventListener('click', async () => {
      if (!isRosterLoaded()) {
        alert('Please load a roster first (Step 1).');
        return;
      }
      const file = fileInput && fileInput.files && fileInput.files[0];
      if (!file) {
        alert('Please choose a file to translate.');
        return;
      }

      try {
        const text = await readFileAsText(file);
        const translated = translateText(text);

        _translatedFileContent = translated;

        // Determine output filename and MIME type
        const origName = file.name;
        const isCSV = /\.csv$/i.test(origName);
        const isTXT = /\.txt$/i.test(origName);
        const isDOCX = /\.docx$/i.test(origName);

        if (isCSV) {
          _translatedFileName = origName.replace(/\.csv$/i, '_district.csv');
          _translatedFileMime = 'text/csv;charset=utf-8;';
        } else if (isTXT) {
          _translatedFileName = origName.replace(/\.txt$/i, '_district.txt');
          _translatedFileMime = 'text/plain;charset=utf-8;';
        } else if (isDOCX) {
          // Platform DOCX files are HTML blobs — preserve extension
          _translatedFileName = origName.replace(/\.docx$/i, '_district.docx');
          _translatedFileMime = 'application/msword';
        } else {
          _translatedFileName = origName + '_district';
          _translatedFileMime = 'text/plain;charset=utf-8;';
        }

        if (fileReadyMsg) fileReadyMsg.textContent = `✅ File translated: ${_translatedFileName}`;
        if (fileDownloadRow) fileDownloadRow.classList.add('visible');
      } catch (err) {
        console.error('[tc-district-export] Failed to translate file:', err);
        alert('Failed to read file: ' + err.message);
      }
    });
  }

  if (downloadFileBtn) {
    downloadFileBtn.addEventListener('click', () => {
      if (!_translatedFileContent || !_translatedFileName) {
        alert('Translate a file first.');
        return;
      }
      const blob = new Blob([_translatedFileContent], { type: _translatedFileMime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = _translatedFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  // Initial status render
  updateRosterStatus();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

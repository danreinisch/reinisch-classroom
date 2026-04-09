/**
 * tc-district-export.js — District Export page controller
 *
 * Manages the "Export for District" page in Teacher Center.
 * All translation is 100% client-side (FERPA compliant).
 * Real names never leave the browser and are never persisted.
 */

import {
  loadRoster,
  clearRoster,
  isRosterLoaded,
  getRosterCount,
  translateText,
  translateAndDownload,
  reverseTranslateText,
  reverseTranslateAndDownload,
} from '/web/district-translator.js';

// ── Helpers ────────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

/**
 * Show a styled alert using rcAlert (from rc-modal.js).
 * Falls back to window.alert if rcModal is not loaded.
 *
 * @param {string} title
 * @param {string} message
 * @returns {Promise<void>}
 */
async function notify(title, message) {
  if (typeof window.rcAlert === 'function') {
    await window.rcAlert(title, message);
  } else {
    // eslint-disable-next-line no-restricted-globals
    window.alert(`${title}\n\n${message}`);
  }
}

// ── Roster status bar ──────────────────────────────────────────────────────

function updateRosterStatus() {
  const statusEl = $('deRosterStatus');
  const clearBtn = $('deClearRosterBtn');
  const count = getRosterCount();

  if (!statusEl) return;

  if (isRosterLoaded()) {
    statusEl.textContent = `✅ Roster loaded — ${count} student${count !== 1 ? 's' : ''}`;
    statusEl.className = 'de-roster-status de-roster-ok';
    if (clearBtn) clearBtn.style.display = '';
  } else {
    statusEl.textContent = '⚠️ No roster loaded — upload a roster CSV to enable translation.';
    statusEl.className = 'de-roster-status de-roster-empty';
    if (clearBtn) clearBtn.style.display = 'none';
  }
}

// ── Roster CSV upload ──────────────────────────────────────────────────────

async function handleRosterUpload(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.csv')) {
    await notify('Invalid File', 'Please upload a CSV file with two columns: code, real_name.');
    return;
  }

  const text = await file.text();
  const count = loadRoster(text);

  if (count === 0) {
    await notify('Empty Roster', 'No valid entries found in the CSV. Make sure it has two columns: code, real_name.');
    return;
  }

  updateRosterStatus();
}

// ── Text / CSV paste translator ────────────────────────────────────────────

async function handleTranslateText() {
  if (!isRosterLoaded()) {
    await notify('No Roster Loaded', 'Please upload a roster CSV first to enable translation.');
    return;
  }

  const inputEl = $('deInputText');
  const outputEl = $('deOutputText');
  if (!inputEl || !outputEl) return;

  const input = inputEl.value.trim();
  if (!input) {
    await notify('Nothing to Translate', 'Please paste some text or CSV content in the input area.');
    return;
  }

  outputEl.value = translateText(input);
}

async function handleCopyOutput() {
  const outputEl = $('deOutputText');
  if (!outputEl || !outputEl.value) {
    await notify('Nothing to Copy', 'Translate some text first.');
    return;
  }
  try {
    await navigator.clipboard.writeText(outputEl.value);
    const btn = $('deCopyOutputBtn');
    if (btn) {
      const original = btn.textContent;
      btn.textContent = '✅ Copied!';
      setTimeout(() => { btn.textContent = original; }, 2000);
    }
  } catch (_err) {
    await notify('Copy Failed', 'Unable to copy to clipboard. Please select and copy the text manually.');
  }
}

async function handleDownloadOutput() {
  const outputEl = $('deOutputText');
  if (!outputEl || !outputEl.value) {
    await notify('Nothing to Download', 'Translate some text first.');
    return;
  }
  const blob = new Blob([outputEl.value], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `district_export_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── File translator ────────────────────────────────────────────────────────

async function handleTranslateFile(file) {
  if (!file) return;

  if (!isRosterLoaded()) {
    await notify('No Roster Loaded', 'Please upload a roster CSV first to enable translation.');
    return;
  }

  const name = file.name.toLowerCase();
  const isText = name.endsWith('.csv') || name.endsWith('.txt');
  const isDocx = name.endsWith('.docx');

  if (!isText && !isDocx) {
    await notify('Unsupported File', 'Please upload a .csv, .txt, or .docx file.');
    return;
  }

  if (isDocx) {
    // Read first bytes to detect real binary .docx (ZIP magic bytes "PK")
    // vs platform HTML-blob exports that happen to have .docx extension.
    const slice = file.slice(0, 512);
    const buffer = await slice.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // ZIP magic: 0x50 0x4B (ASCII "PK")
    const isBinaryDocx = bytes[0] === 0x50 && bytes[1] === 0x4B;
    // Also detect null bytes which indicate binary content
    const hasNullBytes = !isBinaryDocx && bytes.some(b => b === 0x00);

    if (isBinaryDocx || hasNullBytes) {
      await notify(
        'Real Word Document Detected',
        'This appears to be an actual Word (.docx) file. To translate it:\n\n' +
        '1. Open the file in Google Docs or Microsoft Word\n' +
        '2. Copy all the text (Ctrl+A, Ctrl+C)\n' +
        '3. Paste it into the text translator above (Step 2A)\n' +
        '4. Translate, then copy the output back into your document.'
      );
      return;
    }

    // HTML-blob .docx (platform export) — treat as plain text
    const text = await file.text();
    const baseName = file.name.replace(/\.docx$/i, '');
    translateAndDownload(text, `${baseName}_district.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    return;
  }

  // CSV or TXT
  const text = await file.text();
  const baseName = file.name.replace(/\.(csv|txt)$/i, '');
  const ext = name.endsWith('.csv') ? '.csv' : '.txt';
  const mimeType = name.endsWith('.csv') ? 'text/csv;charset=utf-8;' : 'text/plain;charset=utf-8;';

  translateAndDownload(text, `${baseName}_district${ext}`, mimeType);
}

// ── Reverse translator (names → codes) ────────────────────────────────────

async function handleReverseTranslateText() {
  if (!isRosterLoaded()) {
    await notify('No Roster Loaded', 'Please upload a roster CSV first to enable reverse translation.');
    return;
  }

  const inputEl = $('deReverseInputText');
  const outputEl = $('deReverseOutputText');
  if (!inputEl || !outputEl) return;

  const input = inputEl.value.trim();
  if (!input) {
    await notify('Nothing to Translate', 'Please paste some text containing real student names in the input area.');
    return;
  }

  outputEl.value = reverseTranslateText(input);
}

async function handleReverseCopyOutput() {
  const outputEl = $('deReverseOutputText');
  if (!outputEl || !outputEl.value) {
    await notify('Nothing to Copy', 'Reverse-translate some text first.');
    return;
  }
  try {
    await navigator.clipboard.writeText(outputEl.value);
    const btn = $('deReverseCopyOutputBtn');
    if (btn) {
      const original = btn.textContent;
      btn.textContent = '✅ Copied!';
      setTimeout(() => { btn.textContent = original; }, 2000);
    }
  } catch (_err) {
    await notify('Copy Failed', 'Unable to copy to clipboard. Please select and copy the text manually.');
  }
}

async function handleReverseDownloadOutput() {
  const outputEl = $('deReverseOutputText');
  if (!outputEl || !outputEl.value) {
    await notify('Nothing to Download', 'Reverse-translate some text first.');
    return;
  }
  const blob = new Blob([outputEl.value], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `district_coded_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function handleReverseTranslateFile(file) {
  if (!file) return;

  if (!isRosterLoaded()) {
    await notify('No Roster Loaded', 'Please upload a roster CSV first to enable reverse translation.');
    return;
  }

  const name = file.name.toLowerCase();
  const isText = name.endsWith('.csv') || name.endsWith('.txt');
  const isDocx = name.endsWith('.docx');

  if (!isText && !isDocx) {
    await notify('Unsupported File', 'Please upload a .csv, .txt, or .docx file.');
    return;
  }

  if (isDocx) {
    const slice = file.slice(0, 512);
    const buffer = await slice.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const isBinaryDocx = bytes[0] === 0x50 && bytes[1] === 0x4B;
    const hasNullBytes = !isBinaryDocx && bytes.some(b => b === 0x00);

    if (isBinaryDocx || hasNullBytes) {
      await notify(
        'Real Word Document Detected',
        'This appears to be an actual Word (.docx) file. Open it in Google Docs or Word, copy the text, paste it in the textarea above, reverse-translate, then copy the output back.'
      );
      return;
    }

    const text = await file.text();
    const baseName = file.name.replace(/\.docx$/i, '');
    reverseTranslateAndDownload(text, `${baseName}_coded.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    return;
  }

  const text = await file.text();
  const baseName = file.name.replace(/\.(csv|txt)$/i, '');
  const ext = name.endsWith('.csv') ? '.csv' : '.txt';
  const mimeType = name.endsWith('.csv') ? 'text/csv;charset=utf-8;' : 'text/plain;charset=utf-8;';

  reverseTranslateAndDownload(text, `${baseName}_coded${ext}`, mimeType);
}

// ── Initialization ─────────────────────────────────────────────────────────

function init() {
  updateRosterStatus();

  // Roster upload
  const rosterInput = $('deRosterInput');
  const rosterDropZone = $('deRosterDropZone');

  if (rosterInput) {
    rosterInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleRosterUpload(e.target.files[0]);
      }
    });
  }

  if (rosterDropZone) {
    rosterDropZone.addEventListener('click', () => rosterInput && rosterInput.click());
    rosterDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      rosterDropZone.classList.add('de-dragover');
    });
    rosterDropZone.addEventListener('dragleave', () => {
      rosterDropZone.classList.remove('de-dragover');
    });
    rosterDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      rosterDropZone.classList.remove('de-dragover');
      const file = e.dataTransfer && e.dataTransfer.files[0];
      if (file) handleRosterUpload(file);
    });
  }

  // Clear roster
  const clearBtn = $('deClearRosterBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      clearRoster();
      updateRosterStatus();
      if (rosterInput) rosterInput.value = '';
    });
  }

  // Text translator
  const translateTextBtn = $('deTranslateTextBtn');
  if (translateTextBtn) {
    translateTextBtn.addEventListener('click', handleTranslateText);
  }

  const copyOutputBtn = $('deCopyOutputBtn');
  if (copyOutputBtn) {
    copyOutputBtn.addEventListener('click', handleCopyOutput);
  }

  const downloadOutputBtn = $('deDownloadOutputBtn');
  if (downloadOutputBtn) {
    downloadOutputBtn.addEventListener('click', handleDownloadOutput);
  }

  // File translator
  const fileInput = $('deFileInput');
  const fileDropZone = $('deFileDropZone');

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleTranslateFile(e.target.files[0]);
      }
    });
  }

  if (fileDropZone) {
    fileDropZone.addEventListener('click', () => fileInput && fileInput.click());
    fileDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      fileDropZone.classList.add('de-dragover');
    });
    fileDropZone.addEventListener('dragleave', () => {
      fileDropZone.classList.remove('de-dragover');
    });
    fileDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      fileDropZone.classList.remove('de-dragover');
      const file = e.dataTransfer && e.dataTransfer.files[0];
      if (file) handleTranslateFile(file);
    });
  }

  // Reverse translator (names → codes)
  const reverseTranslateTextBtn = $('deReverseTranslateTextBtn');
  if (reverseTranslateTextBtn) {
    reverseTranslateTextBtn.addEventListener('click', handleReverseTranslateText);
  }

  const reverseCopyOutputBtn = $('deReverseCopyOutputBtn');
  if (reverseCopyOutputBtn) {
    reverseCopyOutputBtn.addEventListener('click', handleReverseCopyOutput);
  }

  const reverseDownloadOutputBtn = $('deReverseDownloadOutputBtn');
  if (reverseDownloadOutputBtn) {
    reverseDownloadOutputBtn.addEventListener('click', handleReverseDownloadOutput);
  }

  const reverseFileInput = $('deReverseFileInput');
  const reverseFileDropZone = $('deReverseFileDropZone');

  if (reverseFileInput) {
    reverseFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleReverseTranslateFile(e.target.files[0]);
      }
    });
  }

  if (reverseFileDropZone) {
    reverseFileDropZone.addEventListener('click', () => reverseFileInput && reverseFileInput.click());
    reverseFileDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      reverseFileDropZone.classList.add('de-dragover');
    });
    reverseFileDropZone.addEventListener('dragleave', () => {
      reverseFileDropZone.classList.remove('de-dragover');
    });
    reverseFileDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      reverseFileDropZone.classList.remove('de-dragover');
      const file = e.dataTransfer && e.dataTransfer.files[0];
      if (file) handleReverseTranslateFile(file);
    });
  }

  // Clear page close / unload — roster lives only while the page is open
  window.addEventListener('pagehide', () => clearRoster());
}

init();

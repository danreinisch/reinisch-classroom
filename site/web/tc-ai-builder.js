/* global JSZip */
/**
 * tc-ai-builder.js
 * Teacher Center AI Builder — generate individualized ELA/Life Skills
 * assignments and presentations via Claude (Anthropic API).
 * Student and goal data is pulled live from Supabase via the Netlify function.
 */

(async () => {
  'use strict';

  // Page guard — only run on AI Builder page
  if (!location.pathname.startsWith('/teacher/ai-builder')) return;

  console.log('[tc-ai-builder] Initializing');

  // Import data adapter
  const { db } = await import('/web/data-adapter.js');

  // ── DOM references ──────────────────────────────────────────────────────────

  const typeBtnAssignments = document.getElementById('typeBtnAssignments');
  const typeBtnPresentations = document.getElementById('typeBtnPresentations');
  const typeBtnBoth = document.getElementById('typeBtnBoth');

  const aibWeek = document.getElementById('aibWeek');
  const aibChapters = document.getElementById('aibChapters');
  const aibTheme = document.getElementById('aibTheme');
  const aibScope = document.getElementById('aibScope');
  const aibPresScope = document.getElementById('aibPresScope');
  const aibPresentation = document.getElementById('aibPresentation');
  const aibModel = document.getElementById('aibModel');

  const aibSource = document.getElementById('aibSource');
  const aibSourceFile = document.getElementById('aibSourceFile');
  const aibSourceFileName = document.getElementById('aibSourceFileName');

  const aibImgSection = document.getElementById('aibImgSection');
  const aibImgDrop = document.getElementById('aibImgDrop');
  const aibImgInput = document.getElementById('aibImgInput');
  const aibImgThumbs = document.getElementById('aibImgThumbs');

  const aibLibSearch = document.getElementById('aibLibSearch');
  const aibLibSearchBtn = document.getElementById('aibLibSearchBtn');
  const aibLibResults = document.getElementById('aibLibResults');
  const aibLibSelected = document.getElementById('aibLibSelected');

  const aibGenerateBtn = document.getElementById('aibGenerateBtn');
  const aibProgress = document.getElementById('aibProgress');
  const aibProgressText = document.getElementById('aibProgressText');
  const aibMsg = document.getElementById('aibMsg');

  const aibOutputCard = document.getElementById('aibOutputCard');
  const aibOutput = document.getElementById('aibOutput');
  const aibOutputMsg = document.getElementById('aibOutputMsg');
  const aibSendToWorkBtn = document.getElementById('aibSendToWorkBtn');
  const aibDownloadZipBtn = document.getElementById('aibDownloadZipBtn');

  // ── State ───────────────────────────────────────────────────────────────────

  let currentTaskType = 'assignments';
  const uploadedImages = [];
  let selectedLibRef = null;

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function showMsg(el, text, type) {
    el.textContent = text;
    el.className = 'aib-msg ' + type;
    el.style.display = 'block';
  }

  function hideMsg(el) {
    el.style.display = 'none';
    el.textContent = '';
  }

  function setProgress(visible, text) {
    if (visible) {
      aibProgress.classList.add('visible');
      if (text) aibProgressText.textContent = text;
    } else {
      aibProgress.classList.remove('visible');
    }
  }

  function updateTypeUI() {
    [typeBtnAssignments, typeBtnPresentations, typeBtnBoth].forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.type === currentTaskType);
    });

    const showImages = currentTaskType === 'presentations' || currentTaskType === 'both';
    aibImgSection.style.display = showImages ? 'block' : 'none';

    const showPresScope = currentTaskType === 'presentations' || currentTaskType === 'both';
    aibPresScope.style.display = showPresScope ? 'block' : 'none';
  }

  // ── Task Type Selector ──────────────────────────────────────────────────────

  function handleTypeBtn(e) {
    const btn = e.currentTarget;
    currentTaskType = btn.dataset.type;
    updateTypeUI();
  }

  typeBtnAssignments.addEventListener('click', handleTypeBtn);
  typeBtnPresentations.addEventListener('click', handleTypeBtn);
  typeBtnBoth.addEventListener('click', handleTypeBtn);

  // ── Source File Upload ──────────────────────────────────────────────────────

  aibSourceFile.addEventListener('change', () => {
    const file = aibSourceFile.files[0];
    if (!file) return;
    aibSourceFileName.textContent = file.name;
    const reader = new FileReader();
    reader.onload = (e) => {
      aibSource.value = e.target.result;
    };
    reader.readAsText(file);
  });

  // ── Image Upload ────────────────────────────────────────────────────────────

  function addImages(files) {
    for (let i = 0; i < files.length; i++) {
      if (uploadedImages.length >= 12) break;
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;
      uploadedImages.push(file);
      renderThumb(file, uploadedImages.length - 1);
    }
  }

  function renderThumb(file, idx) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const wrap = document.createElement('div');
      wrap.className = 'aib-img-thumb';
      wrap.dataset.idx = idx;

      const img = document.createElement('img');
      img.src = e.target.result;
      img.alt = file.name;

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = '×';
      removeBtn.setAttribute('aria-label', 'Remove image');
      removeBtn.addEventListener('click', () => {
        uploadedImages.splice(idx, 1);
        rebuildThumbs();
      });

      wrap.appendChild(img);
      wrap.appendChild(removeBtn);
      aibImgThumbs.appendChild(wrap);
    };
    reader.readAsDataURL(file);
  }

  function rebuildThumbs() {
    aibImgThumbs.innerHTML = '';
    uploadedImages.forEach((file, i) => renderThumb(file, i));
  }

  aibImgDrop.addEventListener('click', () => aibImgInput.click());
  aibImgDrop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') aibImgInput.click();
  });

  aibImgDrop.addEventListener('dragover', (e) => {
    e.preventDefault();
    aibImgDrop.classList.add('over');
  });

  aibImgDrop.addEventListener('dragleave', () => {
    aibImgDrop.classList.remove('over');
  });

  aibImgDrop.addEventListener('drop', (e) => {
    e.preventDefault();
    aibImgDrop.classList.remove('over');
    addImages(e.dataTransfer.files);
  });

  aibImgInput.addEventListener('change', () => {
    addImages(aibImgInput.files);
    aibImgInput.value = '';
  });

  // ── Library Reference Search ────────────────────────────────────────────────

  async function searchLibrary() {
    const query = (aibLibSearch.value || '').trim();
    if (!query) return;

    aibLibResults.textContent = 'Searching…';

    try {
      const assignments = await db.getAssignments();
      const lower = query.toLowerCase();
      const matches = (assignments || []).filter(
        (a) =>
          (a.title || '').toLowerCase().includes(lower) ||
          (a.notes || '').toLowerCase().includes(lower)
      );

      if (!matches.length) {
        aibLibResults.textContent = 'No matches found.';
        return;
      }

      aibLibResults.innerHTML = '';
      matches.slice(0, 8).forEach((a) => {
        const item = document.createElement('div');
        item.style.cssText =
          'padding: 6px 8px; border-radius: 6px; cursor: pointer; margin-bottom: 4px; background: rgba(255,255,255,0.04);';
        item.textContent = a.title || '(untitled)';
        item.addEventListener('click', () => {
          selectedLibRef = a;
          aibLibSelected.textContent = '✓ Using: ' + (a.title || '(untitled)');
          aibLibResults.innerHTML = '';
        });
        aibLibResults.appendChild(item);
      });
    } catch (err) {
      aibLibResults.textContent = 'Search failed: ' + err.message;
    }
  }

  aibLibSearchBtn.addEventListener('click', searchLibrary);
  aibLibSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') searchLibrary();
  });

  // ── Generate ────────────────────────────────────────────────────────────────

  async function handleGenerate() {
    hideMsg(aibMsg);
    hideMsg(aibOutputMsg);

    const week = (aibWeek.value || '').trim();
    const chapters = (aibChapters.value || '').trim();
    const theme = (aibTheme.value || '').trim();
    const source = (aibSource.value || '').trim();
    const scope = aibScope.value;
    const model = aibModel.value;
    const taskType = currentTaskType;
    const presentationScope = aibPresentation.value;

    if (!week) {
      showMsg(aibMsg, 'Please enter a week number.', 'err');
      return;
    }
    if (!source) {
      showMsg(aibMsg, 'Please provide source material (paste text or upload a file).', 'err');
      return;
    }

    aibGenerateBtn.disabled = true;
    setProgress(true, 'Querying live student data from Supabase…');

    try {
      // Build images array for presentations
      const imageNames = uploadedImages.map((f) => f.name);

      const payload = {
        taskType,
        week,
        chapters,
        theme,
        source,
        scope,
        model,
        presentationScope: taskType !== 'assignments' ? presentationScope : undefined,
        imageNames: imageNames.length ? imageNames : undefined,
        libraryRef: selectedLibRef
          ? { title: selectedLibRef.title, id: selectedLibRef.id }
          : undefined,
      };

      setProgress(true, 'Calling Claude — this may take 30–60 seconds…');

      const res = await fetch('/.netlify/functions/teacher-ai-builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Generation failed');
      }

      aibOutput.value = typeof data.content === 'string'
        ? data.content
        : JSON.stringify(data.content, null, 2);

      aibOutputCard.style.display = 'block';

      // Show relevant action buttons
      aibSendToWorkBtn.style.display =
        taskType === 'assignments' || taskType === 'both' ? 'inline-flex' : 'none';
      aibDownloadZipBtn.style.display =
        taskType === 'presentations' || taskType === 'both' ? 'inline-flex' : 'none';

      showMsg(aibMsg, 'Generation complete! Review and edit below.', 'ok');
      aibOutputCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      console.error('[tc-ai-builder] Generation error:', err);
      showMsg(aibMsg, 'Error: ' + err.message, 'err');
    } finally {
      aibGenerateBtn.disabled = false;
      setProgress(false);
    }
  }

  aibGenerateBtn.addEventListener('click', handleGenerate);

  // ── Send to Work ────────────────────────────────────────────────────────────

  async function handleSendToWork() {
    const content = (aibOutput.value || '').trim();
    if (!content) {
      showMsg(aibOutputMsg, 'No content to send.', 'err');
      return;
    }

    aibSendToWorkBtn.disabled = true;

    try {
      const week = (aibWeek.value || '').trim();
      const theme = (aibTheme.value || '').trim();
      const title = ['Week', week, theme ? '— ' + theme : '', '— AI Generated']
        .filter(Boolean)
        .join(' ');

      const draft = {
        title,
        assignment: content,
        notes: 'Generated by AI Builder',
      };

      await db.saveDraft(draft);
      showMsg(aibOutputMsg, 'Sent to Work drafts! Open the Work tab to review and issue.', 'ok');
    } catch (err) {
      console.error('[tc-ai-builder] Send to Work error:', err);
      showMsg(aibOutputMsg, 'Error sending to Work: ' + err.message, 'err');
    } finally {
      aibSendToWorkBtn.disabled = false;
    }
  }

  aibSendToWorkBtn.addEventListener('click', handleSendToWork);

  // ── Download ZIP (Presentations) ────────────────────────────────────────────

  async function handleDownloadZip() {
    if (typeof JSZip === 'undefined') {
      showMsg(aibOutputMsg, 'JSZip is not loaded. Check your network connection.', 'err');
      return;
    }

    const htmlContent = (aibOutput.value || '').trim();
    if (!htmlContent) {
      showMsg(aibOutputMsg, 'No content to download.', 'err');
      return;
    }

    aibDownloadZipBtn.disabled = true;

    try {
      const zip = new JSZip();
      const week = (aibWeek.value || 'presentation').trim();
      const folderName = 'presentation-week' + week;
      const folder = zip.folder(folderName);

      folder.file('presentation.html', htmlContent);

      // Bundle uploaded images
      for (let i = 0; i < uploadedImages.length; i++) {
        const file = uploadedImages[i];
        const arrayBuffer = await file.arrayBuffer();
        folder.file(file.name, arrayBuffer);
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = folderName + '.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showMsg(aibOutputMsg, 'ZIP downloaded! Upload images to the presentation folder.', 'ok');
    } catch (err) {
      console.error('[tc-ai-builder] ZIP error:', err);
      showMsg(aibOutputMsg, 'Error creating ZIP: ' + err.message, 'err');
    } finally {
      aibDownloadZipBtn.disabled = false;
    }
  }

  aibDownloadZipBtn.addEventListener('click', handleDownloadZip);

  // ── Init ────────────────────────────────────────────────────────────────────

  updateTypeUI();
  console.log('[tc-ai-builder] Ready');
})();

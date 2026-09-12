(async () => {
  'use strict';

  if (!location.pathname.startsWith('/teacher/review')) return;
  if (window.__rcReviewQolLoaded) return;
  window.__rcReviewQolLoaded = true;

  const { db } = await import('/web/data-adapter.js?v=2026082401');
  const model = await import('/web/tc-review-command-model.js?v=20260911-review-polish');
  const {
    STATUS_LABELS,
    statusOf,
    statusLabel,
    classLabel,
    dateValue,
    formatSubmitted,
    formatDue,
    makeRows,
    uniqueClasses,
    countStatus,
    filterHomeRows,
    groupAssignments,
    assignmentRows,
    assignmentSummary,
  } = model;

  const STORAGE_KEY = 'rc_tc_review_command_center_v1';
  const state = {
    mode: 'home',
    status: 'needs-review',
    className: 'All Classes',
    search: '',
    sort: 'recent',
    assignmentId: null,
    assignmentStatus: 'all',
    assignmentSearch: '',
    focusSubmissionId: null,
    advanceAfterAction: false,
    rows: [],
    expandedFolders: new Set(['needs-review']),
    refreshing: false,
  };

  const $ = id => document.getElementById(id);
  const legacy = {};
  let shell = null;
  let queueObserver = null;
  let syncObserver = null;
  let refreshTimer = null;

  function esc(value) {
    if (value == null) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function cssEscape(value) {
    return window.CSS?.escape ? window.CSS.escape(String(value)) : String(value).replace(/(["\\#.:[\],=])/g, '\\$1');
  }

  function restoreState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!saved) return;
      if (['needs-review', 'reviewed', 'finalized', 'all'].includes(saved.status)) state.status = saved.status;
      if (saved.className) state.className = saved.className;
      if (['recent', 'assignment'].includes(saved.sort)) state.sort = saved.sort;
      if (Array.isArray(saved.expandedFolders)) state.expandedFolders = new Set(saved.expandedFolders);
    } catch (_) { /* presentation preference only */ }
  }

  function persistState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        status: state.status,
        className: state.className,
        sort: state.sort,
        expandedFolders: [...state.expandedFolders],
      }));
    } catch (_) { /* presentation preference only */ }
  }

  function ensureStyle() {
    if (document.querySelector('link[data-rv-qol-style]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/web/tc-review-qol.css?v=20260911-review-polish';
    link.dataset.rvQolStyle = 'true';
    document.head.appendChild(link);
  }

  function captureLegacy() {
    legacy.header = document.querySelector('.rv-header');
    legacy.queue = $('rvQueue');
    legacy.assignmentFilter = $('rvAssignmentFilter');
    legacy.search = $('rvSearch');
  }

  function nextFrame() {
    return new Promise(resolve => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(fallback);
        resolve();
      };
      const fallback = setTimeout(finish, 180);
      requestAnimationFrame(() => requestAnimationFrame(finish));
    });
  }

  async function refreshData({ render = true } = {}) {
    if (state.refreshing) return;
    state.refreshing = true;
    try {
      const [students, assignments, submissions, instances] = await Promise.all([
        db.listStudents(),
        db.listAssignments(),
        db.listSubmissions({ excludeFinalized: false }),
        db.listAssignmentInstances(),
      ]);
      state.rows = makeRows(submissions || [], instances || [], assignments || [], students || []);
      const classes = uniqueClasses(state.rows);
      if (state.className !== 'All Classes' && !classes.includes(state.className)) state.className = 'All Classes';
      if (state.assignmentId && !state.rows.some(row => row.assignmentId === String(state.assignmentId))) {
        state.assignmentId = null;
        if (state.mode !== 'focus') state.mode = 'home';
      }
      if (render) renderShell();
    } catch (error) {
      console.warn('[review-command-center] read-only refresh failed:', error);
      shell?.querySelector('[data-rv-qol-live]')?.replaceChildren(
        document.createTextNode('Review data could not be refreshed. Existing Review controls remain available.')
      );
    } finally {
      state.refreshing = false;
    }
  }

  function legacyStatusId(status) {
    return status === 'reviewed' ? 'rvStatusReviewed'
      : status === 'finalized' ? 'rvStatusFinalized'
        : status === 'all' ? 'rvStatusAll'
          : 'rvStatusNeedsReview';
  }

  async function syncLegacyFilters({ status = state.status, className = state.className, assignmentId = null } = {}) {
    const statusButton = $(legacyStatusId(status));
    if (statusButton && !statusButton.classList.contains('active')) {
      statusButton.click();
      await nextFrame();
    }

    const classContainer = $('rvClassFilters');
    if (classContainer) {
      const classButton = [...classContainer.querySelectorAll('.rv-filter-btn')]
        .find(button => button.dataset.class === className || (className === 'All Classes' && button.dataset.class === 'All Classes'));
      if (classButton && !classButton.classList.contains('active')) {
        classButton.click();
        await nextFrame();
      }
    }

    if (legacy.assignmentFilter) {
      const desired = assignmentId || 'All Assignments';
      const hasOption = [...legacy.assignmentFilter.options].some(option => String(option.value) === String(desired));
      if (hasOption && String(legacy.assignmentFilter.value) !== String(desired)) {
        legacy.assignmentFilter.value = desired;
        legacy.assignmentFilter.dispatchEvent(new Event('change', { bubbles: true }));
        await nextFrame();
      }
    }

    if (legacy.search?.value) {
      legacy.search.value = '';
      legacy.search.dispatchEvent(new Event('input', { bubbles: true }));
      await nextFrame();
    }
  }

  function syncStatusText() {
    const target = shell?.querySelector('[data-rv-qol-sync]');
    const text = $('rvSyncText')?.textContent?.trim();
    if (target && text) target.textContent = text;
  }

  function toolRows() {
    const specs = [
      ['rvBtnAutoGrade', '✨', 'Auto-Grade All'],
      ['rvBtnMarkAllReviewed', '✓', 'Mark All Reviewed'],
      ['rvBtnFinalizeAll', '✓', 'Finalize All Scored'],
      ['rvBtnFinalizeAllReviewed', '✓', 'Finalize All Reviewed'],
      ['rvBtnRevertAllReviewed', '↩', 'Revert All Reviewed'],
    ];
    return specs.map(([id, icon, fallback]) => {
      const source = $(id);
      const disabled = !source || source.disabled || source.style.display === 'none';
      const label = source?.textContent?.replace(/\s+/g, ' ').trim() || fallback;
      return `<button type="button" data-rv-tool="${id}" ${disabled ? 'disabled' : ''}><span>${icon}</span><span>${esc(label)}</span></button>`;
    }).join('');
  }

  function tools() {
    return `<div class="rv-qol-tool-wrap"><button class="rv-qol-tool-button" type="button" data-rv-toggle-tools aria-expanded="false">⚙ Review Tools ▾</button><div class="rv-qol-tool-menu" data-rv-tool-menu hidden>${toolRows()}</div></div>`;
  }

  function statusCards() {
    const cards = [
      ['needs-review', '▧', 'Needs Review', 'Submissions require your attention'],
      ['reviewed', '◷', 'Reviewed', 'Scored, not yet finalized'],
      ['finalized', '▣', 'Finalized', 'Locked review history'],
    ];
    return `<div class="rv-qol-status-grid">${cards.map(([status, icon, label, note]) => `
      <button class="rv-qol-status-card ${state.status === status ? 'is-active' : ''}" type="button" data-rv-status-card="${status}" data-status="${status}">
        <span class="rv-qol-status-icon">${icon}</span><span><strong>${label}</strong><small>${note}</small></span><span class="rv-qol-status-count">${countStatus(state.rows, status)}</span>
      </button>`).join('')}</div>`;
  }

  function folderRow(status, icon) {
    const expanded = state.expandedFolders.has(status);
    const statusRows = status === 'all' ? state.rows : state.rows.filter(row => statusOf(row) === status);
    return `<button class="rv-qol-folder-button ${state.status === status && state.className === 'All Classes' ? 'is-active' : ''}" type="button" data-rv-folder="${status}" aria-expanded="${expanded}"><span>${expanded ? '⌄' : '›'}</span><span>${icon}</span><span>${STATUS_LABELS[status]}</span><span class="rv-qol-folder-count">${statusRows.length}</span></button>
      <div class="rv-qol-folder-children" ${expanded ? '' : 'hidden'}>${uniqueClasses(statusRows).map(name => {
        const count = statusRows.filter(row => row.className === name).length;
        const active = state.status === status && state.className === name;
        return `<button class="rv-qol-class-button ${active ? 'is-active' : ''}" type="button" data-rv-folder-class="${esc(name)}" data-rv-folder-status="${status}"><span>📁</span><span>${esc(classLabel(name))}</span><span class="rv-qol-folder-count">${count}</span></button>`;
      }).join('')}</div>`;
  }

  function folders() {
    return `<aside class="rv-qol-panel rv-qol-folders" aria-label="Review folders"><h2>Folders</h2>${folderRow('all', '🗂')}${folderRow('needs-review', '📁')}${folderRow('reviewed', '📁')}${folderRow('finalized', '▣')}</aside>`;
  }

  function classOptions() {
    return ['All Classes', ...uniqueClasses(state.rows)].map(name =>
      `<option value="${esc(name)}" ${state.className === name ? 'selected' : ''}>${esc(name === 'All Classes' ? name : classLabel(name))}</option>`
    ).join('');
  }

  function emptyState() {
    const filtered = state.search.trim() || state.className !== 'All Classes';
    if (filtered) {
      return '<div class="rv-qol-empty"><strong>No matches in this view.</strong><span>Try clearing the search or class filter.</span></div>';
    }
    if (state.status === 'needs-review') {
      return '<div class="rv-qol-empty is-positive"><strong>You’re caught up.</strong><span>No submissions need review right now.</span></div>';
    }
    if (state.status === 'reviewed') {
      return '<div class="rv-qol-empty"><strong>Nothing is waiting to be finalized.</strong><span>Scored submissions will appear here after review.</span></div>';
    }
    if (state.status === 'finalized') {
      return '<div class="rv-qol-empty"><strong>No finalized history in this view.</strong><span>Finalized student work will appear here.</span></div>';
    }
    return '<div class="rv-qol-empty"><strong>No student work is available.</strong><span>Submitted work will appear here when it reaches Review.</span></div>';
  }

  function assignmentStatusText(group) {
    if (group.status === 'finalized') return 'Finalized';
    if (group.status === 'reviewed') return 'Ready to finalize';
    if (group.status === 'needs-review') return `${group.needs} left`;
    if (group.status === 'returned') return 'Returned';
    return 'Complete';
  }

  function assignmentCards() {
    const visibleRows = filterHomeRows(state.rows, state);
    const groups = groupAssignments(visibleRows, state.rows, state);
    if (!groups.length) return emptyState();
    return `<div class="rv-qol-assignment-list">${groups.map(group => `
      <article class="rv-qol-assignment-card" data-rv-assignment-card="${esc(group.assignmentId)}">
        <div><div class="rv-qol-assignment-title">${esc(group.title)}</div><div class="rv-qol-assignment-meta">${esc(classLabel(group.className))}${group.dueAt ? ` · Due ${esc(formatDue(group.dueAt))}` : ''}</div><div class="rv-qol-assignment-stats"><span>◉ ${group.submitted} student result${group.submitted === 1 ? '' : 's'}</span><span>✓ ${group.reviewed} reviewed</span><span>◷ ${group.needs} need review</span></div></div>
        <div class="rv-qol-progress"><div class="rv-qol-progress-head"><span>${group.reviewed}/${group.submitted} reviewed</span><strong>${group.progress}%</strong></div><div class="rv-qol-progress-track"><span class="rv-qol-progress-fill" style="width:${group.progress}%"></span></div></div>
        <div><span class="rv-qol-status-pill ${esc(group.status)}">${esc(assignmentStatusText(group))}</span></div>
        <button class="rv-qol-open" type="button" data-rv-open-assignment="${esc(group.assignmentId)}">Open →</button>
      </article>`).join('')}</div>`;
  }

  function homeView() {
    const visible = filterHomeRows(state.rows, state).length;
    return `<div class="rv-qol-pagehead"><div><h1>Review</h1><p>Review, score, return, and finalize student work.</p></div><span class="rv-qol-sync"><span data-rv-qol-sync>Sync</span></span></div>
      ${statusCards()}
      <div class="rv-qol-home-grid">${folders()}<section class="rv-qol-panel rv-qol-main">
        <div class="rv-qol-toolbar"><input class="rv-qol-input" type="search" data-rv-home-search value="${esc(state.search)}" placeholder="Search assignments, students, or classes…" aria-label="Search Review assignments"><select class="rv-qol-select" data-rv-home-class aria-label="Filter Review by class">${classOptions()}</select><select class="rv-qol-select" data-rv-home-sort aria-label="Sort Review assignments"><option value="recent" ${state.sort === 'recent' ? 'selected' : ''}>Recent First</option><option value="assignment" ${state.sort === 'assignment' ? 'selected' : ''}>Assignment A–Z</option></select>${tools()}</div>
        <div class="rv-qol-section-title"><h2>${esc(STATUS_LABELS[state.status])}</h2><span>${visible} student result${visible === 1 ? '' : 's'}</span></div>${assignmentCards()}</section></div><div class="rv-qol-live" data-rv-qol-live role="status" aria-live="polite"></div>`;
  }

  function assignmentView() {
    const summary = assignmentSummary(state.rows, state.assignmentId, state.className);
    if (!summary) {
      state.mode = 'home';
      return homeView();
    }
    const rows = assignmentRows(state.rows, state.assignmentId, {
      className: state.className,
      status: state.assignmentStatus,
      search: state.assignmentSearch,
    });
    const options = [['all', 'All Statuses'], ['needs-review', 'Needs Review'], ['reviewed', 'Reviewed'], ['finalized', 'Finalized']];
    return `<section class="rv-qol-panel rv-qol-assignment-view"><button class="rv-qol-back" type="button" data-rv-back-home>← Back to Review</button>
      <div class="rv-qol-assignment-head"><div><h1>${esc(summary.title)}</h1><p>${esc(classLabel(summary.className))}</p></div><div class="rv-qol-progress"><div class="rv-qol-progress-head"><span>${summary.submitted} student result${summary.submitted === 1 ? '' : 's'} · ${summary.reviewed} reviewed · ${summary.needs} need review</span><strong>${summary.progress}%</strong></div><div class="rv-qol-progress-track"><span class="rv-qol-progress-fill" style="width:${summary.progress}%"></span></div>${summary.dueAt ? `<div class="rv-qol-assignment-meta">Due ${esc(formatDue(summary.dueAt))}</div>` : ''}</div></div>
      <div class="rv-qol-toolbar"><input class="rv-qol-input" type="search" data-rv-assignment-search value="${esc(state.assignmentSearch)}" placeholder="Search students…" aria-label="Search students in this assignment"><select class="rv-qol-select" data-rv-assignment-status aria-label="Filter students by status">${options.map(([value, label]) => `<option value="${value}" ${state.assignmentStatus === value ? 'selected' : ''}>${label}</option>`).join('')}</select><div></div>${tools()}</div>
      ${rows.length ? `<div class="rv-qol-table-wrap"><table class="rv-qol-student-table"><thead><tr><th>Student</th><th>Status</th><th>Submitted</th><th>Score</th><th>Actions</th></tr></thead><tbody>${rows.map(row => {
        const status = statusOf(row);
        const score = row.score_total == null ? '—' : `${Number(row.score_total)}%`;
        return `<tr data-needs="${status === 'needs-review'}"><td data-label="Student"><strong>${esc(row.studentCode)}</strong>${row.studentName !== row.studentCode ? `<span class="rv-qol-student-name">${esc(row.studentName)}</span>` : ''}</td><td data-label="Status"><span class="rv-qol-status-pill ${esc(status)}">${esc(statusLabel(row))}</span></td><td data-label="Submitted">${esc(formatSubmitted(row.submitted_at))}</td><td data-label="Score">${esc(score)}</td><td data-label="Actions"><button class="rv-qol-review-button" type="button" data-rv-focus="${esc(row.id)}">${status === 'needs-review' ? 'Review →' : 'View'}</button></td></tr>`;
      }).join('')}</tbody></table></div>` : '<div class="rv-qol-empty"><strong>No students match this view.</strong><span>Try changing the status filter or search.</span></div>'}
      <div class="rv-qol-assignment-footer"><button class="rv-qol-next" type="button" data-rv-review-next ${summary.needs ? '' : 'disabled'}>Review Next →</button></div></section>`;
  }

  function focusRow() {
    return state.rows.find(row => row.id === String(state.focusSubmissionId)) || null;
  }

  function focusPeers() {
    const row = focusRow();
    if (!row) return [];
    return state.rows.filter(peer => peer.assignmentId === row.assignmentId && (state.className === 'All Classes' || peer.className === state.className))
      .sort((a, b) => dateValue(a.submitted_at) - dateValue(b.submitted_at));
  }

  function focusHeader() {
    const row = focusRow();
    if (!row) return '';
    const peers = focusPeers();
    const index = Math.max(0, peers.findIndex(peer => peer.id === row.id));
    const status = statusOf(row);
    return `<div class="rv-qol-focus-head"><button class="rv-qol-back" type="button" data-rv-back-assignment>← Back to ${esc(row.assignmentTitle)}</button><div class="rv-qol-focus-title"><strong>${esc(row.studentCode)}</strong><span class="rv-qol-status-pill ${esc(status)}">${esc(statusLabel(row))}</span><small>${esc(row.assignmentTitle)} · ${esc(classLabel(row.className))}</small></div><div class="rv-qol-focus-nav"><button type="button" data-rv-focus-prev ${index <= 0 ? 'disabled' : ''}>‹</button><span>${index + 1} of ${peers.length}</span><button type="button" data-rv-focus-next ${index >= peers.length - 1 ? 'disabled' : ''}>›</button></div>${status === 'finalized' ? '<button class="rv-qol-proxy" type="button" data-rv-proxy="reopen">Reopen Submission</button>' : '<button class="rv-qol-proxy warning" type="button" data-rv-proxy="return">Return for Revision</button><button class="rv-qol-proxy" type="button" data-rv-proxy="save">Save Grade</button><button class="rv-qol-proxy primary" type="button" data-rv-proxy="finalize">Finalize & Next →</button>'}</div>`;
  }

  function renderShell() {
    if (!shell) return;
    if (state.mode === 'focus') {
      shell.innerHTML = focusHeader();
      document.body.classList.add('rv-qol-focus');
      syncFocusDom();
    } else {
      document.body.classList.remove('rv-qol-focus');
      shell.innerHTML = state.mode === 'assignment' ? assignmentView() : homeView();
      syncStatusText();
    }
  }

  async function waitForLegacyHeader(submissionId, timeout = 3500) {
    const selector = `.rv-submission-header[data-submission-id="${cssEscape(submissionId)}"]`;
    const start = performance.now();
    while (performance.now() - start < timeout) {
      const header = document.querySelector(selector);
      if (header) return header;
      await new Promise(resolve => setTimeout(resolve, 60));
    }
    return null;
  }

  async function enterAssignment(assignmentId) {
    state.mode = 'assignment';
    state.assignmentId = String(assignmentId);
    state.assignmentStatus = 'all';
    state.assignmentSearch = '';
    state.focusSubmissionId = null;
    state.advanceAfterAction = false;
    await syncLegacyFilters({ status: 'all', className: state.className, assignmentId: null });
    renderShell();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function enterFocus(submissionId) {
    const row = state.rows.find(item => item.id === String(submissionId));
    if (!row) return;
    state.mode = 'focus';
    state.assignmentId = row.assignmentId;
    state.focusSubmissionId = row.id;
    state.advanceAfterAction = false;
    renderShell();
    const status = statusOf(row);
    const legacyStatus = ['reviewed', 'finalized'].includes(status) ? status : status === 'needs-review' ? 'needs-review' : 'all';
    await syncLegacyFilters({ status: legacyStatus, className: state.className, assignmentId: row.sourceAssignmentId || null });
    const header = await waitForLegacyHeader(row.id);
    if (header && header.getAttribute('aria-expanded') !== 'true') header.click();
    await nextFrame();
    renderShell();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function syncFocusProxyState(selected) {
    const selectors = { return: '.rv-btn-return', save: '.rv-btn-save-grade', finalize: '.rv-btn-finalize', reopen: '.rv-btn-reopen' };
    for (const [name, selector] of Object.entries(selectors)) {
      const proxy = shell?.querySelector(`[data-rv-proxy="${name}"]`);
      if (!proxy) continue;
      const source = selected.querySelector(selector);
      proxy.disabled = !source || source.disabled;
      proxy.hidden = !source;
    }
  }

  function polishLegacyFocus(selected) {
    const row = focusRow();
    selected.dataset.rvQolStatus = row ? statusOf(row) : '';
    selected.querySelectorAll('details').forEach(details => {
      const summary = details.querySelector(':scope > summary');
      if (/^\s*debug\b/i.test(summary?.textContent || '')) details.classList.add('rv-qol-debug');
    });
    selected.querySelectorAll('.rv-summary-row').forEach(summaryRow => {
      const label = summaryRow.querySelector('span:first-child')?.textContent?.trim();
      if (label === 'Manual:' && /\(0\/0 scored\)/.test(summaryRow.textContent || '')) {
        summaryRow.classList.add('rv-qol-zero-manual');
      }
    });
  }

  function syncFocusDom() {
    if (state.mode !== 'focus' || !legacy.queue) return;
    let selected = null;
    legacy.queue.querySelectorAll('.rv-submission-item').forEach(item => {
      const match = item.querySelector('.rv-submission-header')?.dataset.submissionId === String(state.focusSubmissionId);
      item.classList.toggle('rv-qol-selected', Boolean(match));
      if (match) selected = item;
    });
    if (!selected) {
      scheduleRefreshAfterLegacyChange();
      return;
    }
    const header = selected.querySelector('.rv-submission-header');
    if (header?.getAttribute('aria-expanded') !== 'true') {
      header.click();
      return;
    }
    polishLegacyFocus(selected);
    syncFocusProxyState(selected);
  }

  function clickFocusProxy(action) {
    const selected = legacy.queue?.querySelector('.rv-submission-item.rv-qol-selected');
    if (!selected) return;
    const selectors = { return: '.rv-btn-return', save: '.rv-btn-save-grade', finalize: '.rv-btn-finalize', reopen: '.rv-btn-reopen' };
    const source = selected.querySelector(selectors[action]);
    if (!source || source.disabled) return;
    state.advanceAfterAction = action === 'finalize';
    const focusId = state.focusSubmissionId;
    if (action === 'finalize') {
      setTimeout(() => {
        if (state.focusSubmissionId === focusId && legacy.queue?.querySelector('.rv-submission-item.rv-qol-selected')) state.advanceAfterAction = false;
      }, 30000);
    }
    source.click();
  }

  async function moveFocus(direction) {
    const peers = focusPeers();
    const index = peers.findIndex(row => row.id === String(state.focusSubmissionId));
    const target = peers[index + direction];
    if (target) await enterFocus(target.id);
  }

  async function reviewNext() {
    const next = assignmentRows(state.rows, state.assignmentId, {
      className: state.className,
      status: 'needs-review',
      search: '',
    })[0];
    if (next) await enterFocus(next.id);
  }

  function scheduleRefreshAfterLegacyChange() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      const previousId = state.focusSubmissionId;
      const assignmentId = state.assignmentId;
      const shouldAdvance = state.advanceAfterAction;
      await refreshData({ render: false });
      if (state.mode !== 'focus') return;
      const updated = state.rows.find(row => row.id === String(previousId));
      if (shouldAdvance && updated && statusOf(updated) === 'finalized') {
        const next = assignmentRows(state.rows, assignmentId, {
          className: state.className,
          status: 'needs-review',
          search: '',
        })[0];
        if (next) {
          await enterFocus(next.id);
          return;
        }
        state.mode = 'assignment';
        state.focusSubmissionId = null;
        state.advanceAfterAction = false;
        renderShell();
        return;
      }
      if (updated) {
        renderShell();
        return;
      }
      if (shouldAdvance) {
        const next = assignmentRows(state.rows, assignmentId, {
          className: state.className,
          status: 'needs-review',
          search: '',
        })[0];
        if (next) {
          await enterFocus(next.id);
          return;
        }
      }
      state.mode = 'assignment';
      state.assignmentId = assignmentId;
      state.focusSubmissionId = null;
      state.advanceAfterAction = false;
      renderShell();
    }, 180);
  }

  function preservingInput(selector) {
    const active = document.activeElement;
    const restore = active?.matches?.(selector);
    const start = restore && typeof active.selectionStart === 'number' ? active.selectionStart : null;
    const end = restore && typeof active.selectionEnd === 'number' ? active.selectionEnd : null;
    renderShell();
    if (!restore) return;
    const replacement = shell?.querySelector(selector);
    replacement?.focus({ preventScroll: true });
    if (replacement && start != null && end != null && typeof replacement.setSelectionRange === 'function') replacement.setSelectionRange(start, end);
  }

  function wireObservers() {
    if (legacy.queue && !queueObserver) {
      queueObserver = new MutationObserver(() => {
        if (state.mode === 'focus') {
          requestAnimationFrame(syncFocusDom);
        } else {
          clearTimeout(refreshTimer);
          refreshTimer = setTimeout(() => refreshData(), 220);
        }
      });
      queueObserver.observe(legacy.queue, { childList: true });
    }
    if ($('rvSyncText') && !syncObserver) {
      syncObserver = new MutationObserver(syncStatusText);
      syncObserver.observe($('rvSyncText'), { childList: true, characterData: true, subtree: true });
    }
  }

  function wireEvents() {
    shell.addEventListener('click', async event => {
      const statusCard = event.target.closest('[data-rv-status-card]');
      if (statusCard) {
        state.status = statusCard.dataset.rvStatusCard;
        state.className = 'All Classes';
        state.expandedFolders.add(state.status);
        persistState();
        await syncLegacyFilters({ status: state.status, className: state.className });
        renderShell();
        return;
      }
      const folder = event.target.closest('[data-rv-folder]');
      if (folder) {
        const status = folder.dataset.rvFolder;
        state.expandedFolders.has(status) ? state.expandedFolders.delete(status) : state.expandedFolders.add(status);
        state.status = status;
        state.className = 'All Classes';
        persistState();
        await syncLegacyFilters({ status, className: state.className });
        renderShell();
        return;
      }
      const folderClass = event.target.closest('[data-rv-folder-class]');
      if (folderClass) {
        state.status = folderClass.dataset.rvFolderStatus;
        state.className = folderClass.dataset.rvFolderClass;
        persistState();
        await syncLegacyFilters({ status: state.status, className: state.className });
        renderShell();
        return;
      }
      const open = event.target.closest('[data-rv-open-assignment]');
      if (open) return enterAssignment(open.dataset.rvOpenAssignment);
      if (event.target.closest('[data-rv-back-home]')) {
        state.mode = 'home';
        state.assignmentId = null;
        state.focusSubmissionId = null;
        state.advanceAfterAction = false;
        await syncLegacyFilters({ status: state.status, className: state.className });
        renderShell();
        return;
      }
      if (event.target.closest('[data-rv-back-assignment]')) {
        state.mode = 'assignment';
        state.focusSubmissionId = null;
        state.advanceAfterAction = false;
        await refreshData({ render: false });
        await syncLegacyFilters({ status: 'all', className: state.className, assignmentId: null });
        renderShell();
        return;
      }
      const focus = event.target.closest('[data-rv-focus]');
      if (focus) return enterFocus(focus.dataset.rvFocus);
      if (event.target.closest('[data-rv-review-next]')) return reviewNext();
      if (event.target.closest('[data-rv-focus-prev]')) return moveFocus(-1);
      if (event.target.closest('[data-rv-focus-next]')) return moveFocus(1);
      const proxy = event.target.closest('[data-rv-proxy]');
      if (proxy) return clickFocusProxy(proxy.dataset.rvProxy);
      const toggleTools = event.target.closest('[data-rv-toggle-tools]');
      if (toggleTools) {
        const menu = shell.querySelector('[data-rv-tool-menu]');
        if (menu) {
          const opening = menu.hidden;
          if (opening) menu.innerHTML = toolRows();
          menu.hidden = !opening;
          toggleTools.setAttribute('aria-expanded', String(opening));
        }
        return;
      }
      const tool = event.target.closest('[data-rv-tool]');
      if (tool) {
        const source = $(tool.dataset.rvTool);
        if (source && !source.disabled && source.style.display !== 'none') source.click();
      }
    });

    shell.addEventListener('input', event => {
      if (event.target.matches('[data-rv-home-search]')) {
        state.search = event.target.value;
        preservingInput('[data-rv-home-search]');
      } else if (event.target.matches('[data-rv-assignment-search]')) {
        state.assignmentSearch = event.target.value;
        preservingInput('[data-rv-assignment-search]');
      }
    });

    shell.addEventListener('change', async event => {
      if (event.target.matches('[data-rv-home-class]')) {
        state.className = event.target.value;
        persistState();
        await syncLegacyFilters({ status: state.status, className: state.className });
        renderShell();
      } else if (event.target.matches('[data-rv-home-sort]')) {
        state.sort = event.target.value;
        persistState();
        renderShell();
      } else if (event.target.matches('[data-rv-assignment-status]')) {
        state.assignmentStatus = event.target.value;
        renderShell();
      }
    });
  }

  async function waitForReviewDom(timeout = 6000) {
    const start = performance.now();
    while (performance.now() - start < timeout) {
      if ($('rvQueue') && $('rvStatusNeedsReview') && $('rvAssignmentFilter') && document.querySelector('#rvClassFilters .rv-filter-btn')) return true;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return false;
  }

  async function init() {
    restoreState();
    if (!await waitForReviewDom()) return;
    ensureStyle();
    captureLegacy();
    shell = document.createElement('section');
    shell.id = 'rvReviewCommandCenter';
    shell.className = 'rv-qol-command';
    shell.setAttribute('aria-label', 'Review command center');
    legacy.header?.insertAdjacentElement('beforebegin', shell);
    document.body.classList.add('rv-qol-enabled');
    wireEvents();
    wireObservers();
    await refreshData({ render: false });
    await syncLegacyFilters({ status: state.status, className: state.className });
    renderShell();
    syncStatusText();
    window.addEventListener('focus', () => refreshData({ render: state.mode !== 'focus' }));
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) refreshData({ render: state.mode !== 'focus' });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
import { getTodaysSubPlan } from './sub-plans.js';

// ── Helpers ──────────────────────────────────────────────────────────────

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

function formatDateLong(date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatDateYMD(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ── Auth ─────────────────────────────────────────────────────────────────

async function checkSession() {
  try {
    const res = await fetch('/.netlify/functions/substitute-session', {
      method: 'GET',
      credentials: 'include',
    });
    if (res.ok) {
      const data = await res.json();
      return data.ok && data.role === 'substitute';
    }
    return false;
  } catch (err) {
    console.error('[substitute] Session check failed:', err);
    return false;
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const pin = document.getElementById('subPin').value.trim();
  const password = document.getElementById('subPassword').value;
  const errorDiv = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');

  errorDiv.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = 'Signing in…';

  try {
    const res = await fetch('/.netlify/functions/substitute-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ pin, password }),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      window.location.reload();
    } else {
      errorDiv.textContent = data.error || 'Invalid PIN or password.';
      errorDiv.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  } catch (err) {
    console.error('[substitute] Login failed:', err);
    errorDiv.textContent = 'Login failed. Please try again.';
    errorDiv.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
}

async function handleLogout() {
  try {
    await fetch('/.netlify/functions/substitute-logout', {
      method: 'POST',
      credentials: 'include',
    });
  } catch (err) {
    console.error('[substitute] Logout failed:', err);
  }
  window.location.reload();
}

// ── Plan rendering ───────────────────────────────────────────────────────

function renderPresentationLinks(urls) {
  if (!urls || !urls.length) return '';
  const items = urls.map(url => {
    let label = url;
    try { label = new URL(url).pathname.split('/').filter(Boolean).pop() || url; } catch (_) {
      label = url.includes('/') ? url.split('/').pop() : url;
    }
    const returnPath = encodeURIComponent('/substitute/');
    const viewerHref = `/viewer/?src=${encodeURIComponent(url)}&return=${returnPath}`;
    const presHref = `/viewer/?src=${encodeURIComponent(url)}&return=${returnPath}&mode=presentation`;
    return `<li><a class="sp-pres-link" href="${escapeHtml(viewerHref)}">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
        <polyline points="15 3 21 3 21 9"></polyline>
        <line x1="10" y1="14" x2="21" y2="3"></line>
      </svg>
      <span class="sp-pres-link-text">${escapeHtml(label)}</span>
    </a><a class="sp-pres-mode-dot" href="${escapeHtml(presHref)}" title="Presentation Mode" aria-label="Open in Presentation Mode"></a></li>`;
  }).join('');
  return `<ul class="sp-pres-list">${items}</ul>`;
}

function renderEmptyState() {
  return `<div class="sp-empty">
    <div class="sp-empty-icon">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
        <line x1="16" y1="13" x2="8" y2="13"></line>
        <line x1="16" y1="17" x2="8" y2="17"></line>
      </svg>
    </div>
    <div class="sp-empty-title">No plan for today</div>
    <p>No substitute plan has been published for today. Please check with the teacher or office.</p>
  </div>`;
}

function renderPlan(plan) {
  if (!plan) return renderEmptyState();

  // Language Arts
  const laContent = [];
  if (plan.la_lesson) {
    laContent.push(`<div class="sp-label">Lesson</div><div class="sp-value">${escapeHtml(plan.la_lesson)}</div>`);
  }
  if (plan.la_book) {
    laContent.push(`<div class="sp-label">Book</div><div class="sp-value">${escapeHtml(plan.la_book)}</div>`);
  }
  if (!plan.la_lesson && !plan.la_book) {
    laContent.push(`<div class="sp-value" style="color:var(--rc-muted)">No lesson details provided.</div>`);
  }
  if (plan.la_presentations && plan.la_presentations.length) {
    laContent.push(`<div class="sp-label">Presentations</div>${renderPresentationLinks(plan.la_presentations)}`);
  }

  // Life Skills
  const lsContent = [];
  if (plan.life_skills_topic) {
    lsContent.push(`<div class="sp-label">Topic</div><div class="sp-value">${escapeHtml(plan.life_skills_topic)}</div>`);
  } else {
    lsContent.push(`<div class="sp-value" style="color:var(--rc-muted)">No topic provided.</div>`);
  }
  if (plan.life_skills_presentations && plan.life_skills_presentations.length) {
    lsContent.push(`<div class="sp-label">Presentations</div>${renderPresentationLinks(plan.life_skills_presentations)}`);
  }

  // Notes card (only if notes exist)
  const notesCard = plan.notes ? `
    <div class="sp-card">
      <h2 class="sp-card-title">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="16" y1="13" x2="8" y2="13"></line>
          <line x1="16" y1="17" x2="8" y2="17"></line>
        </svg>
        Notes
      </h2>
      <div class="sp-notes-box">${escapeHtml(plan.notes)}</div>
    </div>` : '';

  return `
    <div class="sp-card">
      <h2 class="sp-card-title">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
        </svg>
        Language Arts
      </h2>
      ${laContent.join('')}
    </div>
    <div class="sp-card">
      <h2 class="sp-card-title">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"></path>
          <path d="M9 18h6"></path>
          <path d="M10 22h4"></path>
        </svg>
        Life Skills
      </h2>
      ${lsContent.join('')}
    </div>
    ${notesCard}`;
}

// ── Dashboard loading ────────────────────────────────────────────────────

async function loadDashboard() {
  const today = new Date();
  document.getElementById('dateText').textContent = formatDateLong(today);

  try {
    const plan = await getTodaysSubPlan(formatDateYMD(today));

    const badge = document.getElementById('statusBadge');
    if (!plan) {
      badge.className = 'sp-badge none';
      badge.textContent = 'No plan';
    } else if (plan.published) {
      badge.className = 'sp-badge published';
      badge.textContent = 'Published';
    } else {
      badge.className = 'sp-badge draft';
      badge.textContent = 'Draft';
    }

    document.getElementById('planContent').innerHTML = renderPlan(plan);
  } catch (err) {
    console.error('[substitute] Failed to load plan:', err);
    document.getElementById('planContent').innerHTML = `
      <div class="sp-empty">
        <div class="sp-empty-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>
        <div class="sp-empty-title">Unable to load plan</div>
        <p>${escapeHtml(err.message || 'Check your connection and try refreshing.')}</p>
      </div>`;
  }

  // Reload every 5 minutes to catch updates — setInterval started in init()
}

// ── Init ─────────────────────────────────────────────────────────────────

async function init() {
  const authenticated = await checkSession();
  if (authenticated) {
    document.getElementById('loginView').classList.add('hidden');
    document.getElementById('dashboardView').classList.remove('hidden');
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    loadDashboard();
    setInterval(loadDashboard, 5 * 60 * 1000);
  } else {
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
  }
}

init();

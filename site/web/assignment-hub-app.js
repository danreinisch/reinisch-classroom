async function fetchJSON(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, data: res.ok ? JSON.parse(text) : text }; }
  catch { return { ok: res.ok, status: res.status, data: text }; }
}

const SUBMITTED_KEY = 'rc_submitted';

// NOTE: submitted state is stored locally per device/browser only.
// A student who submits on one device will not see the locked state on another device.
// TODO: A future enhancement could query the server for submission status on load
// (e.g., check a /submissions-status endpoint) and merge with local state.
function getSubmitted() {
  try { return JSON.parse(localStorage.getItem(SUBMITTED_KEY) || '[]'); }
  catch { return []; }
}

const SUBMITTED_MAX = 200;

function markSubmitted(id) {
  const sid = String(id);
  // Normalize all stored IDs to strings to handle mixed types from pre-fix storage
  const list = getSubmitted().map(String);
  if (!list.includes(sid)) {
    list.push(sid);
    // Cap the array to prevent unbounded growth across school years;
    // oldest (front) entries are dropped first (FIFO) to keep the most recent submissions
    if (list.length > SUBMITTED_MAX) list.splice(0, list.length - SUBMITTED_MAX);
  }
  localStorage.setItem(SUBMITTED_KEY, JSON.stringify(list));
}

function lockCard(cardEl) {
  cardEl.querySelectorAll('input, textarea, select').forEach(el => {
    el.disabled = true;
    el.classList.add('submitted-disabled');
  });
  const btn = cardEl.querySelector('button[type="submit"]');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '✓ Submitted';
  }
  if (!cardEl.querySelector('.submitted-banner')) {
    const banner = document.createElement('div');
    banner.className = 'submitted-banner';
    banner.textContent = '✓ Your work has been submitted successfully!';
    const form = cardEl.querySelector('form');
    if (form) form.parentElement.insertBefore(banner, form);
  }
}

function card(assign) {
  const due = assign.due_date ? new Date(assign.due_date + 'T00:00:00').toLocaleDateString() : 'No due date';
  return `
    <div class="card" data-id="${assign.id}">
      <h3>${assign.title}</h3>
      <div class="meta">Due: ${due} · Section: ${assign.section || 'language-arts'}</div>
      <p>${assign.description || ''}</p>
      <form onsubmit="return submitWork(event, ${assign.id})">
        <input type="text" name="student_name" placeholder="Your name" required />
        <textarea name="content" placeholder="Write your response (optional)"></textarea>
        <input type="text" name="content_url" placeholder="Link to Google Doc / Drive (optional)" />
        <button type="submit">Submit</button>
        <span class="status" aria-live="polite"></span>
      </form>
    </div>
  `;
}

async function loadAssignments() {
  const { ok, data } = await fetchJSON('/.netlify/functions/assignments-list');
  const list = document.getElementById('list');
  if (!ok) { list.textContent = 'Failed to load assignments.'; return; }
  const A = (data.assignments || []);
  if (!A.length) { list.textContent = 'No active assignments yet.'; return; }
  list.innerHTML = A.map(card).join('');
  const submitted = getSubmitted();
  submitted.forEach(id => {
    const cardEl = list.querySelector(`.card[data-id="${CSS.escape(String(id))}"]`);
    if (cardEl) lockCard(cardEl);
  });
}

async function submitWork(ev, assignment_id) {
  ev.preventDefault();
  const form = ev.target;
  const status = form.querySelector('.status');
  status.textContent = 'Submitting…';
  const payload = {
    assignment_id,
    student_name: form.student_name.value.trim(),
    content: form.content.value.trim() || null,
    content_url: form.content_url.value.trim() || null,
  };
  const { ok, data } = await fetchJSON('/.netlify/functions/submissions-create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (ok) {
    status.textContent = 'Submitted!';
    status.className = 'status ok';
    markSubmitted(assignment_id);
    const cardEl = form.closest('.card');
    if (cardEl) lockCard(cardEl);
  } else {
    status.textContent = 'Submit failed: ' + (typeof data === 'string' ? data : 'error');
    status.className = 'status err';
  }
  return false;
}

window.submitWork = submitWork;

loadAssignments();

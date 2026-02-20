async function fetchJSON(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, data: res.ok ? JSON.parse(text) : text }; }
  catch { return { ok: res.ok, status: res.status, data: text }; }
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
    form.reset();
  } else {
    status.textContent = 'Submit failed: ' + (typeof data === 'string' ? data : 'error');
    status.className = 'status err';
  }
  return false;
}

window.submitWork = submitWork;

loadAssignments();

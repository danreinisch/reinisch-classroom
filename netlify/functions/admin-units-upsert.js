const GH_API = 'https://api.github.com';

function json(status, data) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(data),
  };
}

function nowISO() { return new Date().toISOString(); }

function safeJsonParse(s) { try { return JSON.parse(s); } catch { return null; } }

function ensureArraySize(arr, n) { while (arr.length < n) arr.push(''); }

function escapeHtml(s = '') {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function normalizeUnits(data) {
  const arr = Array.isArray(data?.units) ? data.units : [];
  const byId = Object.create(null);
  const list = [];
  for (const u of arr) {
    if (!u || !u.id) continue;
    const nu = {
      id: String(u.id),
      title: String(u.title || ''),
      kind: String(u.kind || 'collection'),
      description: String(u.description || ''),
      status: String(u.status || 'active'),
      sortOrder: Number.isFinite(Number(u.sortOrder)) ? Number(u.sortOrder) : 0,
      section: String(u.section || ''),
      baseOut: String(u.baseOut || ''),
      slots: Number(u.slots || 0),
      pagePath: String(u.pagePath || ''),
    };
    byId[nu.id] = nu;
    list.push(nu);
  }
  return { list, byId };
}

function ensureStateShape(state, units) {
  if (!state || typeof state !== 'object') state = { version: 'v1', updated: '', categories: {} };
  if (!state.categories) state.categories = {};
  for (const u of units.list) {
    if (!u?.id) continue;
    if (!state.categories[u.id]) state.categories[u.id] = { slots: Number(u.slots) || 0, titles: [], links: [] };
  }
  return state;
}

// Minimal category index (lists links; Open if missing)
function generateCategoryIndex(category, state, units) {
  const unit = units.byId[category];
  const titles = state?.categories?.[category]?.titles || [];
  const links  = state?.categories?.[category]?.links  || [];

  const items = titles.map((t, i) => {
    const n = String(i + 1).padStart(2, '0');
    const href = links[i] || '#';
    const label = (t || '').trim() ? t : `Presentation ${i + 1}`;
    const isOpen = !links[i];
    return `<li style="margin:.4rem 0">${
      isOpen
        ? `<span style="opacity:.6">${n} — Open</span>`
        : `<a href="${href}">${n} — ${escapeHtml(label)}</a>`
    }</li>`;
  }).join('\n');

  const title = unit?.title || 'Presentations';
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(title)}</title>
</head>
<body style="background:#0b1220;color:#e8edf5;font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif">
<div style="max-width:900px;margin:2rem auto;padding:1rem 1.2rem;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.18);border-radius:12px">
  <h1 style="margin-top:0">${escapeHtml(title)}</h1>
  <ul style="list-style:none;padding:0">${items}</ul>
</div>
</body></html>`;
}

// ---- GitHub helpers ----
function ghHeaders() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('Missing GITHUB_TOKEN');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'reinisch-admin-upsert',
    Accept: 'application/vnd.github+json',
  };
}

async function safeText(res) { try { return await res.text(); } catch { return ''; } }

async function ghGET(path) {
  const res = await fetch(`${GH_API}${path}`, { headers: ghHeaders() });
  if (!res.ok) {
    const txt = await safeText(res);
    const e = new Error(`GitHub GET ${path} ${res.status} ${txt}`);
    e.status = res.status;
    throw e;
  }
  return res.json();
}

async function ghPOST(path, body) {
  const res = await fetch(`${GH_API}${path}`, { method: 'POST', headers: ghHeaders(), body: JSON.stringify(body || {}) });
  if (!res.ok) {
    const txt = await safeText(res);
    const e = new Error(`GitHub POST ${path} ${res.status} ${txt}`);
    e.status = res.status;
    throw e;
  }
  return res.json();
}

async function ghPATCH(path, body) {
  const res = await fetch(`${GH_API}${path}`, { method: 'PATCH', headers: ghHeaders(), body: JSON.stringify(body || {}) });
  if (!res.ok) {
    const txt = await safeText(res);
    const e = new Error(`GitHub PATCH ${path} ${res.status} ${txt}`);
    e.status = res.status;
    throw e;
  }
  return res.json();
}

function parseRepo() {
  const slug = process.env.GH_REPO || '';
  if (!slug || !slug.includes('/')) throw new Error('GH_REPO must be "owner/repo"');
  const [owner, repo] = slug.split('/');
  return { owner, repo };
}


async function getRepoInfo() {
  const { owner, repo } = parseRepo();
  return await ghGET(`/repos/${owner}/${repo}`);
}

async function getRepoDefaultBranch() {
  const { owner, repo } = parseRepo();
  const info = await ghGET(`/repos/${owner}/${repo}`);
  return info.default_branch || 'main';
}

async function getBranch() {
  return process.env.GH_BRANCH || await getRepoDefaultBranch();
}

// Safer branch selection: default to admin/units-<id> unless explicitly provided
async function getBranchSafe({ unitId, requestedBranch }) {
  const info = await getRepoInfo();
  const base = info.default_branch || 'main';
  const clean = (requestedBranch || '').trim();
  if (clean) return { branch: clean, base };
  if (unitId) return { branch: `admin/units-${unitId}`, base };
  return { branch: base, base };
}

// Ensure a branch exists before we commit to it
async function ensureBranchExists(owner, repo, branch, baseBranch) {
  try {
    await ghGET(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
    return { created: false };
  } catch (err) {
    const msg = String(err?.message || err);
    if (!msg.includes('404') && !msg.toLowerCase().includes('not found')) throw err;

    const baseRef = await ghGET(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(baseBranch)}`);
    const sha = baseRef?.object?.sha;
    const res = await fetch(`${GH_API}/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      headers: ghHeaders(),
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha })
    });
    if (!res.ok) {
      const t = await res.text().catch(()=>'');
      throw new Error(`Failed to create branch ${branch}: ${res.status} ${t}`);
    }
    return { created: true, sha };
  }
}


// Create or reuse a PR so branch-based unit updates can be published safely.
async function getOrCreatePR(owner, repo, headBranch, baseBranch, unit, commitSha) {
  // Try to find an existing open PR for this head branch
  const q = new URLSearchParams({
    state: 'open',
    head: `${owner}:${headBranch}`,
    base: baseBranch
  }).toString();

  const listRes = await fetch(`${GH_API}/repos/${owner}/${repo}/pulls?${q}`, { headers: ghHeaders() });
  if (listRes.ok) {
    const arr = await listRes.json().catch(() => []);
    if (Array.isArray(arr) && arr.length) {
      const pr = arr[0];
      return { number: pr.number, url: pr.html_url, existing: true };
    }
  }

  const title = `Publish unit: ${unit.id} (${unit.title})`;
  const lines = [
    'Auto-generated by Teacher Center.',
    '',
    `- Unit: ${unit.id}`,
    `- Branch: ${headBranch}`,
    commitSha ? `- Commit: ${commitSha}` : ''
  ].filter(Boolean);

  const createRes = await fetch(`${GH_API}/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    headers: ghHeaders(),
    body: JSON.stringify({ title, head: headBranch, base: baseBranch, body: lines.join('\n') })
  });

  const j = await createRes.json().catch(() => ({}));
  if (!createRes.ok) {
    throw new Error(`Failed to create PR for ${headBranch}: ${createRes.status} ${JSON.stringify(j)}`);
  }
  return { number: j.number, url: j.html_url, existing: false };
}


// Tree helper: used only to decide whether to also write root copies + whether index already exists
async function getHeadTreePaths(owner, repo, branch) {
  let head;
  try {
    head = await ghGET(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  } catch (e) {
    if (String(e?.message || e).includes(' 404 ')) return new Set();
    throw e;
  }
  const commit = await ghGET(`/repos/${owner}/${repo}/git/commits/${head.object.sha}`);
  const tree = await ghGET(`/repos/${owner}/${repo}/git/trees/${commit.tree.sha}?recursive=1`);
  const set = new Set();
  for (const n of (tree.tree || [])) if (n?.path) set.add(n.path);
  return set;
}

async function getJsonFileFromRepo(owner, repo, branch, path, fallbackObj) {
  const res = await fetch(`${GH_API}/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`, { headers: ghHeaders() });
  if (!res.ok) return fallbackObj;
  const j = await res.json();
  const content = Buffer.from(j.content || '', 'base64').toString('utf8');
  const parsed = safeJsonParse(content);
  return parsed || fallbackObj;
}

async function commitTree(owner, repo, branch, pathToBufferMap, message) {
  const head = await ghGET(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  const commit = await ghGET(`/repos/${owner}/${repo}/git/commits/${head.object.sha}`);
  const baseTreeSha = commit.tree.sha;

  const entries = [];
  for (const [path, buf] of pathToBufferMap.entries()) {
    const blob = await ghPOST(`/repos/${owner}/${repo}/git/blobs`, { content: buf.toString('base64'), encoding: 'base64' });
    entries.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
  }

  const tree = await ghPOST(`/repos/${owner}/${repo}/git/trees`, { base_tree: baseTreeSha, tree: entries });
  const newCommit = await ghPOST(`/repos/${owner}/${repo}/git/commits`, { message, tree: tree.sha, parents: [head.object.sha] });
  await ghPATCH(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, { sha: newCommit.sha, force: false });

  return newCommit.sha;
}

// ---- Auth: verify current teacher session (same-origin cookies) ----
async function verifySession(event) {
  const host = (event.headers['x-forwarded-host'] || event.headers.host || '').split(',')[0].trim();
  const proto = (event.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const cookie = event.headers.cookie || event.headers.Cookie || '';

  if (!host) return { ok: false, response: json(401, { ok: false, error: 'Missing host' }) };

  const url = `${proto}://${host}/.netlify/functions/teacher-session`;
  let r;
  try {
    r = await fetch(url, {
      method: 'GET',
      headers: { cookie, 'cache-control': 'no-store' },
      redirect: 'manual',
    });
  } catch (e) {
    return { ok: false, response: json(401, { ok: false, error: 'Session check failed' }) };
  }

  if (!r.ok) return { ok: false, response: json(401, { ok: false, error: 'Session expired or invalid' }) };


  const text = await r.text().catch(() => '');
  const j = safeJsonParse(text);
  // HARD GATE: must be admin (raw_role from teacher-session)
  const rawRole = (j && (j.raw_role ?? j.rawRole ?? j.role)) || null;
  if (rawRole !== 'admin') return { ok: false, response: json(403, { ok: false, error: 'Admin required' }) };
  if (j && j.ok === false) return { ok: false, response: json(401, { ok: false, error: 'Session expired or invalid' }) };

  return { ok: true };
}

// ---- Input validation ----
function validatePayload(p) {
  const title = String(p?.title || '').trim();
  const id = String(p?.id || '').trim();
  const kind = String(p?.kind || 'collection').trim();
  const description = String(p?.description || '').trim();
  const status = String(p?.status || 'active').trim();
  const sortOrder = Number(p?.sortOrder || 0);
  const section = String(p?.section || '').trim();
  const slots = Number(p?.slots || 0);
  const baseOut = String(p?.baseOut || '').trim();
  const pagePath = String(p?.pagePath || '').trim();

  if (!title) return 'Title is required';
  if (!/^[a-z0-9][a-z0-9_-]{1,31}$/.test(id)) {
    return 'Invalid id (2–32 chars: a–z, 0–9, - or _)';
  }
  if (!['book', 'unit', 'theme', 'text-set', 'collection', 'toolkit'].includes(kind)) {
    return 'Invalid collection type';
  }
  if (description.length > 500) return 'Description must be 500 characters or fewer';
  if (!['active', 'archived'].includes(status)) return 'Invalid collection status';
  if (!Number.isFinite(sortOrder) || sortOrder < -100000 || sortOrder > 100000) {
    return 'Invalid display order';
  }
  if (!['language-arts', 'life-skills'].includes(section)) return 'Invalid section';
  if (!Number.isFinite(slots) || slots < 1 || slots > 64) return 'Slots must be 1–64';
  if (!baseOut || baseOut.startsWith('/') || baseOut.includes('..')) {
    return 'baseOut must be a relative path (no leading "/" or "..")';
  }
  if (!pagePath.startsWith('/') || !pagePath.endsWith('/')) {
    return 'pagePath must start and end with "/"';
  }

  return '';
}


function policyValue(value) {
  return String(value || '').trim();
}

function validateUnitUpdatePolicy(existingUnit, unit) {
  if (existingUnit) {
    for (const field of ['section', 'baseOut', 'pagePath']) {
      if (policyValue(existingUnit[field]) !== policyValue(unit[field])) {
        return `Existing collection ${field} is locked to preserve live routes and materials.`;
      }
    }

    return '';
  }

  if (unit.section === 'language-arts') {
    if (unit.pagePath !== '/language-arts/collection/') {
      return 'New Language Arts collections must use the shared collection route.';
    }

    if (unit.baseOut !== `presentations/${unit.id}`) {
      return 'New Language Arts collections must use the managed presentation folder.';
    }
  }

  return '';
}

exports.validateUnitUpdatePolicy = validateUnitUpdatePolicy;

exports.handler = async (event) => {
  // Parse request body once (used for branch + confirmMain)
  const body = safeJsonParse(event.body || '{}') || {};

  const requestId = (event.headers && (event.headers['x-nf-request-id'] || event.headers['x-request-id'])) || '';

  try {
    if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });

    const auth = await verifySession(event);
    if (!auth.ok) return auth.response;

    const payload = safeJsonParse(event.body || '{}') || {};
    const err = validatePayload(payload);
    if (err) return json(400, { ok: false, error: err });

    const unit = {
      id: String(payload.id).trim(),
      title: String(payload.title).trim(),
      kind: String(payload.kind || 'collection').trim(),
      description: String(payload.description || '').trim(),
      status: String(payload.status || 'active').trim(),
      sortOrder: Number.isFinite(Number(payload.sortOrder)) ? Number(payload.sortOrder) : 0,
      section: String(payload.section).trim(),
      slots: Number(payload.slots),
      baseOut: String(payload.baseOut).trim(),
      pagePath: String(payload.pagePath).trim(),
    };

    const { owner, repo } = parseRepo();
    const requestedBranch = body?.branch;
    const confirmMain = body?.confirmMain === true;
    const { branch, base } = await getBranchSafe({ unitId: unit.id, requestedBranch });
    if (branch === 'main' && !confirmMain) {
      return jsonResponse(event, 400, { ok: false, error: 'Refusing to write to main without confirmMain:true' }, {}, requestId);
    }
    await ensureBranchExists(owner, repo, branch, base);

    const paths = await getHeadTreePaths(owner, repo, branch);

    // Read existing units.json + site-state.json from repo (branch)
    const unitsPath = 'site/assets/data/units.json';
    const unitsDoc = await getJsonFileFromRepo(owner, repo, branch, unitsPath, { units: [], version: 'v1', updated: '' });

    // Upsert unit in units.json (preserve order; replace if exists)
    const existingUnits = Array.isArray(unitsDoc.units) ? unitsDoc.units.slice() : [];
    const idx = existingUnits.findIndex(u => u && String(u.id) === unit.id);
    const existingUnit = idx >= 0 ? existingUnits[idx] : null;

    const policyError = validateUnitUpdatePolicy(existingUnit, unit);
    if (policyError) return json(400, { ok: false, error: policyError });

    const nextUnit = { ...unit };

    if (idx >= 0) existingUnits[idx] = { ...existingUnits[idx], ...nextUnit };
    else existingUnits.push(nextUnit);

    const nextUnitsDoc = {
      ...unitsDoc,
      units: existingUnits,
      version: unitsDoc.version || 'v1',
      updated: nowISO(),
    };

    const units = normalizeUnits(nextUnitsDoc);

    const statePath = 'site/assets/data/site-state.json';
    const state = await getJsonFileFromRepo(owner, repo, branch, statePath, { version: 'v1', updated: '', categories: {} });
    const nextState = ensureStateShape(state, units);

    // Guardrail: don't allow shrinking slots (avoids accidental data loss)
    const existingCat = nextState.categories[unit.id];
    const oldSlots = Number(existingCat?.slots || 0);
    if (oldSlots && unit.slots < oldSlots) {
      return json(400, { ok: false, error: `Refusing to shrink slots from ${oldSlots} to ${unit.slots} (data loss risk). Increase only, or edit manually.` });
    }

    // Ensure category exists and arrays sized
    if (!nextState.categories[unit.id]) nextState.categories[unit.id] = { slots: unit.slots, titles: [], links: [] };
    nextState.categories[unit.id].slots = unit.slots;

    nextState.categories[unit.id].titles = Array.isArray(nextState.categories[unit.id].titles) ? nextState.categories[unit.id].titles : [];
    nextState.categories[unit.id].links  = Array.isArray(nextState.categories[unit.id].links)  ? nextState.categories[unit.id].links  : [];

    ensureArraySize(nextState.categories[unit.id].titles, unit.slots);
    ensureArraySize(nextState.categories[unit.id].links,  unit.slots);

    nextState.version = nextState.version || 'v1';
    nextState.updated = nowISO();

    // Compute unit index file path from pagePath
    const unitIndexPath = `site${unit.pagePath}index.html`; // pagePath begins/ends with /
    const blobs = new Map();

    // Always write site copies
    blobs.set('site/assets/data/units.json', Buffer.from(JSON.stringify(nextUnitsDoc, null, 2) + '\n', 'utf8'));
    blobs.set('site/assets/data/site-state.json', Buffer.from(JSON.stringify(nextState, null, 2) + '\n', 'utf8'));

    // Keep parity with incremental-deploy: if root copies exist already, update them too (don’t invent structure)
    if (paths.has('assets/data/units.json')) {
      blobs.set('assets/data/units.json', Buffer.from(JSON.stringify(nextUnitsDoc, null, 2) + '\n', 'utf8'));
    }
    if (paths.has('assets/data/site-state.json')) {
      blobs.set('assets/data/site-state.json', Buffer.from(JSON.stringify(nextState, null, 2) + '\n', 'utf8'));
    }

    // New Language Arts collections use the reusable generic collection page.
    // Do not create a one-off static page for them. Existing explicit routes
    // retain their current create-if-missing behavior.
    const usesGenericCollectionRoute =
      unit.section === 'language-arts' &&
      unit.pagePath === '/language-arts/collection/';

    let createdIndex = false;
    if (!usesGenericCollectionRoute && !paths.has(unitIndexPath)) {
      const html = generateCategoryIndex(unit.id, nextState, units);
      blobs.set(unitIndexPath, Buffer.from(html, 'utf8'));
      createdIndex = true;
    }

    const commit = await commitTree(owner, repo, branch, blobs, `Upsert unit: ${unit.id} (${unit.title})`);

    const createPr = body?.createPr === true;
    let pr = null;
    if (createPr && branch !== base && branch !== 'main') {
      pr = await getOrCreatePR(owner, repo, branch, base, unit, commit);
    }

    return json(200, {
      ok: true,
      commit,
      branch,
      pr, unit,
      createdIndex,
      usesGenericCollectionRoute,
      unitIndexPath,
    });
  } catch (e) {
    return json(500, { ok: false, error: String(e?.message || e) });
  }
};

function jsonResponse(_event, statusCode, obj, _headers = {}, _requestId = '') {
  return json(statusCode, obj);
}

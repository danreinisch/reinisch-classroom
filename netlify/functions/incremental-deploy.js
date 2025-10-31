// Incremental Deploy (GitHub commits) + diagnostics + delete
// Auth: Allows if EITHER a valid admin session cookie is present OR the legacy ADMIN_KEY matches.
// If ADMIN_KEY is not set, only session-based auth works.
//
// Required envs (Netlify → Project configuration → Environment variables):
// - GITHUB_TOKEN     (classic PAT with repo scope, or fine‑grained with Contents RW on the repo)
// - GH_REPO          (e.g., "danreinisch/reinisch-classroom")
// - GH_BRANCH        (optional; defaults to repo default branch)
// - PUBLIC_SITE_URL  (e.g., "https://reinischclassroom.com")
// - ADMIN_SESSION_SECRET (same as the login function)
//
// Optional:
// - ADMIN_KEY        (legacy; if present, requests may also send header x-admin-key: <value>)

const crypto = require('crypto');

const GH_API = 'https://api.github.com';
const SESSION_COOKIE_NAMES = ['rc_admin_session_v2', 'rc_admin_session'];
const DELETE = Symbol('DELETE');

exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const actionQS = qs.action || '';

    // Diagnostics and maintenance (GET)
    if (event.httpMethod === 'GET') {
      if (actionQS === 'diagnostics') {
        return json(200, {
          ok: true,
          hasGithubToken: !!process.env.GITHUB_TOKEN,
          ghRepo: process.env.GH_REPO || '',
          ghBranch: process.env.GH_BRANCH || '',
          hasPublicSiteUrl: !!process.env.PUBLIC_SITE_URL
        });
      }
      return json(200, { ok: true, message: 'Use POST to upload or delete; GET ?action=diagnostics' });
    }

    if (event.httpMethod !== 'POST') return json(405, { message: 'Method not allowed' });

    await requireAdmin(event);

    let body = {};
    try { body = JSON.parse(event.body || '{}'); }
    catch { return json(400, { message: 'Invalid JSON body' }); }

    const { action } = body;

    if (action === 'delete') {
      return await handleDelete(body);
    } else {
      return await handleUpload(body);
    }
  } catch (e) {
    console.error('Top-level error:', e && e.stack ? e.stack : e);
    const msg = e && e.message ? String(e.message) : '';
    const status = (e && (e.status || e.statusCode)) ? (e.status || e.statusCode)
                  : (msg.toLowerCase().startsWith('unauthorized') ? 401 : 500);
    return json(status, { message: shortErr(e) });
  }
};

// ---------- Upload ----------
async function handleUpload(body){
  const { category, slot, title, files, merge, final } = body;

  const CAT_META = getCatMeta();
  if (!CAT_META[category]) return json(400, { message: 'Unknown category' });
  const cat = CAT_META[category];
  if (!slot || slot < 1 || slot > cat.slots) return json(400, { message: 'Invalid slot' });
  if (!Array.isArray(files) || files.length === 0) return json(400, { message: 'Missing files' });

  const { owner, repo } = parseRepo();
  const branch = await getBranch();

  const slotDir = `site/${cat.baseOut}/presentation-${String(slot).padStart(2, '0')}`;
  const blobs = new Map();

  // Always add the uploaded files
  for (const f of files) {
    if (!f.path || !f.base64) continue;
    const buf = Buffer.from(f.base64, 'base64');
    let outPath = (f.path || '').replace(/^\/+/, '');
    if (outPath.startsWith('assets/images/')) outPath = `site/${outPath}`;
    else outPath = `${slotDir}/${outPath}`;
    blobs.set(outPath, buf);
  }

  // Only on final batch do we add redirect + update state pages.
  if (final) {
    if (!title || !String(title).trim()) return json(400, { message: 'Missing title for final batch' });

    const entryRel = await pickEntryHtml(owner, repo, branch, blobs, slotDir);
    const redirectHtml = redirectIndexHtml(title, entryRel, cat.back, cat.section);
    blobs.set(`${slotDir}/index.html`, Buffer.from(redirectHtml));

    const state = await fetchStateFromLiveOrRepo(owner, repo, branch);
    ensureStateShape(state);
    ensureArraySize(state.categories[category].titles, cat.slots);
    ensureArraySize(state.categories[category].links,  cat.slots);
    state.categories[category].titles[slot - 1] = title;
    state.categories[category].links[slot - 1]  = `/${cat.baseOut}/presentation-${String(slot).padStart(2, '0')}/`;
    state.updated = new Date().toISOString();

    blobs.set('site/assets/data/site-state.json', Buffer.from(JSON.stringify(state, null, 2)));

    const catIndexPath = `site${categoryIndexPath(category)}`;
    if (catIndexPath) {
      const html = generateCategoryIndex(category, state);
      blobs.set(catIndexPath, Buffer.from(html));
    }
  }

  const message = final
    ? `Upload ${category} #${slot} (final batch)`
    : `Upload ${category} #${slot} (batch)`;

  const commitSha = await commitTreeWithRetry(owner, repo, branch, blobs, message);
  return json(200, { ok: true, commit: commitSha, final: !!final, files: files.length });
}

// ---------- Delete ----------
async function handleDelete(body){
  const { category, slot } = body || {};
  const CAT_META = getCatMeta();
  if (!CAT_META[category]) return json(400, { message: 'Unknown category' });
  const cat = CAT_META[category];
  if (!slot || slot < 1 || slot > cat.slots) return json(400, { message: 'Invalid slot' });

  const { owner, repo } = parseRepo();
  const branch = await getBranch();

  const slotDirRel = `${cat.baseOut}/presentation-${String(slot).padStart(2, '0')}/`;
  const slotDir = `site/${slotDirRel}`;

  const headTree = await getHeadTree(owner, repo, branch);
  const paths = (headTree.tree || []).map(n => n.path);
  const toDelete = paths.filter(p => p.startsWith(slotDir));

  const blobs = new Map();
  for (const p of toDelete) {
    blobs.set(p, DELETE);
  }

  const state = await fetchStateFromLiveOrRepo(owner, repo, branch);
  ensureStateShape(state);
  ensureArraySize(state.categories[category].titles, cat.slots);
  ensureArraySize(state.categories[category].links,  cat.slots);
  state.categories[category].titles[slot - 1] = '';
  state.categories[category].links[slot - 1]  = '';
  state.updated = new Date().toISOString();

  blobs.set('site/assets/data/site-state.json', Buffer.from(JSON.stringify(state, null, 2)));

  const catIndexPath = `site${categoryIndexPath(category)}`;
  if (catIndexPath) {
    const html = generateCategoryIndex(category, state);
    blobs.set(catIndexPath, Buffer.from(html));
  }

  const commitSha = await commitTreeWithRetry(owner, repo, branch, blobs, `Delete ${category} #${slot}`);
  return json(200, { ok: true, deleted: true, commit: commitSha });
}

// ---------- Auth helper (session cookie OR ADMIN_KEY) ----------
async function requireAdmin(event){
  const secret = (process.env.ADMIN_SESSION_SECRET || '').trim();
  if (secret && verifySessionCookie(event.headers || {}, secret)) return;

  const requiredKey = process.env.ADMIN_KEY;
  if (requiredKey) {
    const hdrs = event.headers || {};
    const sentKey = hdrs['x-admin-key'] || hdrs['X-Admin-Key'] || hdrs['x-Admin-Key'];
    if (sentKey && sentKey === requiredKey) return;
  }

  const err = new Error('Unauthorized');
  err.status = 401;
  throw err;
}

function verifySessionCookie(headers, secret){
  try {
    const cookieHeader = headers.cookie || headers.Cookie || '';
    if (!cookieHeader) return false;
    let token = '';
    for (const n of SESSION_COOKIE_NAMES) {
      token = getCookie(cookieHeader, n);
      if (token) break;
    }
    if (!token) return false;

    const dot = token.indexOf('.');
    if (dot <= 0) return false;
    const payloadB64 = token.slice(0, dot);
    const sigB64 = token.slice(dot + 1);

    const payloadBuf = b64urlDecode(payloadB64);
    let data;
    try { data = JSON.parse(payloadBuf.toString('utf8')); } catch { return false; }
    if (!data || typeof data.exp !== 'number') return false;

    const now = Math.floor(Date.now() / 1000);
    if (data.exp <= now) return false;

    const expected = crypto.createHmac('sha256', secret).update(payloadBuf).digest();
    const actual = b64urlDecode(sigB64);
    if (expected.length !== actual.length) return false;
    return crypto.timingSafeEqual(expected, actual);
  } catch { return false; }
}

// ---------- GitHub helpers ----------
function parseRepo() {
  const slug = process.env.GH_REPO || '';
  if (!slug || !slug.includes('/')) throw new Error('GH_REPO must be "owner/repo"');
  const [owner, repo] = slug.split('/');
  return { owner, repo };
}
async function getBranch() { return process.env.GH_BRANCH || await getRepoDefaultBranch(); }
async function getRepoDefaultBranch() {
  const { owner, repo } = parseRepo();
  const info = await ghGET(`/repos/${owner}/${repo}`);
  return info.default_branch || 'main';
}

async function commitTreeWithRetry(owner, repo, branch, pathToBufferMap, message, attempt=0) {
  try { return await commitTree(owner, repo, branch, pathToBufferMap, message); }
  catch (err) {
    const msg = String(err && err.message || '');
    if (attempt < 1 && (msg.includes('not a fast forward') || (msg.includes('/git/refs/heads') && msg.includes('422')))) {
      return await commitTreeWithRetry(owner, repo, branch, pathToBufferMap, message, attempt+1);
    }
    throw err;
  }
}

async function commitTree(owner, repo, branch, pathToBufferMap, message) {
  const head   = await ghGET(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  const commit = await ghGET(`/repos/${owner}/${repo}/git/commits/${head.object.sha}`);
  const baseTreeSha = commit.tree.sha;

  const entries = [];
  for (const [path, value] of pathToBufferMap.entries()) {
    if (value === DELETE) {
      entries.push({ path, mode: '100644', type: 'blob', sha: null });
    } else {
      const buf = value;
      const blob = await ghPOST(`/repos/${owner}/${repo}/git/blobs`, { content: buf.toString('base64'), encoding: 'base64' });
      entries.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
    }
  }

  const tree = await ghPOST(`/repos/${owner}/${repo}/git/trees`, { base_tree: baseTreeSha, tree: entries });
  const newCommit = await ghPOST(`/repos/${owner}/${repo}/git/commits`, { message, tree: tree.sha, parents: [head.object.sha] });
  await ghPATCH(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, { sha: newCommit.sha, force: false });

  return newCommit.sha;
}

async function ghGET(path) {
  const res = await fetch(`${GH_API}${path}`, { headers: ghHeaders() });
  if (!res.ok) throw new Error(`GitHub GET ${path} ${res.status} ${await safeText(res)}`);
  return res.json();
}
async function ghPOST(path, body) {
  const res = await fetch(`${GH_API}${path}`, { method:'POST', headers: ghHeaders(), body: JSON.stringify(body||{}) });
  if (!res.ok) throw new Error(`GitHub POST ${path} ${res.status} ${await safeText(res)}`);
  return res.json();
}
async function ghPATCH(path, body) {
  const res = await fetch(`${GH_API}${path}`, { method:'PATCH', headers: ghHeaders(), body: JSON.stringify(body||{}) });
  if (!res.ok) throw new Error(`GitHub PATCH ${path} ${res.status} ${await safeText(res)}`);
  return res.json();
}
function ghHeaders() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('Missing GITHUB_TOKEN');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'reinisch-uploader',
    Accept: 'application/vnd.github+json'
  };
}
async function safeText(res){ try{ return await res.text(); } catch{ return ''; } }

// ---------- State and page helpers ----------
function getCatMeta(){
  return {
    toolkit: { slots: 8,  baseOut: 'presentations/language-arts-toolkit', section: 'language-arts', back: '/language-arts/toolkit/index.html' },
    adit:    { slots: 16, baseOut: 'presentations/a-door-into-time',      section: 'language-arts', back: '/language-arts/a-door-into-time/index.html' },
    lik:     { slots: 16, baseOut: 'presentations/lost-in-kragdon-ah',     section: 'language-arts', back: '/language-arts/lost-in-kragdon-ah/index.html' },
    rfk:     { slots: 16, baseOut: 'presentations/return-from-kragdon-ah', section: 'language-arts', back: '/language-arts/return-from-kragdon-ah/index.html' },
    wok:     { slots: 16, baseOut: 'presentations/warrior-of-kragdon-ah',  section: 'language-arts', back: '/language-arts/warrior-of-kragdon-ah/index.html' },
    life:    { slots: 32, baseOut: 'life-skills/presentations',            section: 'life-skills',   back: '/life-skills/index.html' }
  };
}

async function fetchStateFromLiveOrRepo(owner, repo, branch) {
  try {
    const base = process.env.PUBLIC_SITE_URL;
    if (base) {
      const res = await fetch(`${base}/assets/data/site-state.json`, { headers: { 'Cache-Control':'no-cache' } });
      if (res.ok) return await res.json();
    }
  } catch {}
  try {
    const res = await fetch(`${GH_API}/repos/${owner}/${repo}/contents/site/assets/data/site-state.json?ref=${encodeURIComponent(branch)}`, { headers: ghHeaders() });
    if (res.ok) {
      const json = await res.json();
      const content = Buffer.from(json.content || '', 'base64').toString('utf8');
      return JSON.parse(content);
    }
  } catch {}
  const state = { version: 'v1', updated: '', categories: {} };
  const meta = getCatMeta();
  for (const [id, m] of Object.entries(meta)) {
    state.categories[id] = { slots: m.slots, titles: [], links: [] };
  }
  return state;
}

async function getHeadTree(owner, repo, branch) {
  const head   = await ghGET(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  const commit = await ghGET(`/repos/${owner}/${repo}/git/commits/${head.object.sha}`);
  return ghGET(`/repos/${owner}/${repo}/git/trees/${commit.tree.sha}?recursive=1`);
}

function categoryIndexPath(category){
  return category==='toolkit' ? '/language-arts/toolkit/index.html'
    : category==='life' ? '/life-skills/index.html'
    : ({ adit:'/language-arts/a-door-into-time/index.html', lik:'/language-arts/lost-in-kragdon-ah/index.html', rfk:'/language-arts/return-from-kragdon-ah/index.html', wok:'/language-arts/warrior-of-kragdon-ah/index.html' }[category] || '');
}

function generateCategoryIndex(category, state){
  const meta = getCatMeta()[category];
  const titles = state?.categories?.[category]?.titles || [];
  const links  = state?.categories?.[category]?.links  || [];
  const items = titles.map((t, i) => {
    const n = String(i+1).padStart(2,'0');
    const href = links[i] || '#';
    const label = (t||'').trim() ? t : `Presentation ${i+1}`;
    const isOpen = !links[i];
    return `<li style="margin:.4rem 0">${isOpen ? `<span style="opacity:.6">${n} — Open</span>` : `<a href="${href}">${n} — ${escapeHtml(label)}</a>`}</li>`;
  }).join('\n');
  const title = categoryTitle(category);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(title)}</title></head><body style="background:#0b1220;color:#e8edf5;font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif"><div style="max-width:900px;margin:2rem auto;padding:1rem 1.2rem;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.18);border-radius:12px"><h1 style="margin-top:0">${escapeHtml(title)}</h1><ul style="list-style:none;padding:0">${items}</ul></div></body></html>`;
}
function categoryTitle(id){
  return id==='toolkit' ? 'Language Arts Toolkit'
    : id==='adit' ? 'A Door Into Time'
    : id==='lik' ? 'Lost in Kragdon‑Ah'
    : id==='rfk' ? 'Return from Kragdon‑Ah'
    : id==='wok' ? 'Warrior of Kragdon‑Ah'
    : id==='life' ? 'Life Skills'
    : 'Presentations';
}

function redirectIndexHtml(title, targetRel, backHref, section){
  const getSectionReturn = (s) => s==='life-skills' ? '/life-skills/index.html' : '/language-arts/index.html';
  const navHtml = `<div style="position:fixed;top:1rem;left:1rem;right:1rem;display:flex;justify-content:space-between;z-index:100">
    <a href="/" style="color:#fff;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);padding:.6rem 1rem;border-radius:.6rem;text-decoration:none">Home</a>
    <a href="${getSectionReturn(section)}" style="color:#fff;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);padding:.6rem 1rem;border-radius:.6rem;text-decoration:none">Back to ${section==='life-skills'?'Life Skills':'Language Arts'}</a>
    <a href="${backHref}" style="color:#fff;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);padding:.6rem 1rem;border-radius:.6rem;text-decoration:none">Back to unit</a>
  </div>`;
  if(!targetRel){
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(title)}</title></head><body style="background:#0b1220;color:#e8edf5;font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif">${navHtml}<div style="max-width:960px;margin:6rem auto 2rem;padding:1rem;color:#fff">No entry HTML found in this slot yet.</div></body></html>`;
  }
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta http-equiv="refresh" content="0; url=${targetRel}"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(title)}</title></head><body style="background:#0b1220;color:#e8edf5;font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif">${navHtml}<p style="color:#fff;padding:1rem">Redirecting…</p></body></html>`;
}

function ensureStateShape(state){
  if(!state||typeof state!=='object') state={version:'v1',updated:'',categories:{}};
  if(!state.categories) state.categories={};
  const meta = getCatMeta();
  for(const [id, m] of Object.entries(meta)){
    if(!state.categories[id]) state.categories[id] = { slots: m.slots, titles: [], links: [] };
  }
}
function escapeHtml(s=''){return s.replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function ensureArraySize(arr,n){ while(arr.length<n) arr.push(''); }
function shortErr(e){ const msg = e && e.message ? e.message : String(e); return (msg || 'Server error').slice(0, 600); }
function json(status,data){ return { statusCode:status, headers:{'Content-Type':'application/json','Cache-Control':'no-store'}, body: JSON.stringify(data) }; }

// ---------- Small helpers ----------
function getCookie(header, name) {
  for (const part of header.split(/;\s*/)) {
    const [k, ...v] = part.split('=');
    if (k === name) return v.join('=');
  }
  return '';
}
function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = str.length % 4; if (pad) str += '='.repeat(4 - pad);
  return Buffer.from(str, 'base64');
}

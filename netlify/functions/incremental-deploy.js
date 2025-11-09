'use strict';

// Incremental Deploy (GitHub commits) + diagnostics + delete
// Universal, data-driven: reads site/assets/data/units.json to discover units.
// Default: DOES NOT regenerate unit pages (preserves your custom design).
// To opt-in to auto-generation (minimal fallback), set REGENERATE_CATEGORY_INDEX=1.

const crypto = require('crypto');

const GH_API = 'https://api.github.com';
const SESSION_COOKIE_NAMES = ['rc_admin_session_v2', 'rc_admin_session'];
const DELETE = Symbol('DELETE');
const REGENERATE_CATEGORY_INDEX = String(process.env.REGENERATE_CATEGORY_INDEX || '').trim() === '1';

exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const actionQS = qs.action || '';

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
    if (action === 'delete') return await handleDelete(body);
    return await handleUpload(body);
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
  const { category, slot, title, files, final } = body;

  const units = await loadUnits();
  const unit = units.byId[category];
  if (!unit) return json(400, { message: 'Unknown category' });

  const slots = Number(unit.slots) || 1;
  if (!slot || slot < 1 || slot > slots) return json(400, { message: 'Invalid slot' });
  if (!Array.isArray(files) || files.length === 0) return json(400, { message: 'Missing files' });

  const { owner, repo } = parseRepo();
  const branch = await getBranch();

  const slotDir = `site/${unit.baseOut}/presentation-${String(slot).padStart(2, '0')}`;
  const blobs = new Map();

  // Add uploaded files
  for (const f of files) {
    if (!f.path || !f.base64) continue;
    const buf = Buffer.from(f.base64, 'base64');
    let outPath = (f.path || '').replace(/^\/+/, '');
    if (outPath.startsWith('assets/images/')) outPath = `site/${outPath}`;
    else outPath = `${slotDir}/${outPath}`;
    blobs.set(outPath, buf);
  }

  // Only in final batch: redirect + state update
  if (final) {
    const entryRel = await pickEntryHtml(owner, repo, branch, blobs, slotDir);
    
    // Fetch existing state from repo to get the latest committed version
    const state = await fetchStateFromRepo(owner, repo, branch, units);
    ensureStateShape(state, units);
    ensureArraySize(state.categories[category].titles, slots);
    ensureArraySize(state.categories[category].links,  slots);
    
    // Preserve existing title if no title provided (allow blank to keep existing)
    const existingTitle = state.categories[category].titles[slot - 1] || '';
    const finalTitle = (title && String(title).trim()) ? title : existingTitle;
    if (!finalTitle) return json(400, { message: 'Missing title for final batch (no existing title to preserve)' });
    
    const redirectHtml = redirectIndexHtml(finalTitle, entryRel, unit.pagePath, unit.section);
    blobs.set(`${slotDir}/index.html`, Buffer.from(redirectHtml));
    
    // Update only the current slot
    state.categories[category].titles[slot - 1] = finalTitle;
    state.categories[category].links[slot - 1]  = `/${unit.baseOut}/presentation-${String(slot).padStart(2, '0')}/`;
    state.updated = new Date().toISOString();

    // Mirror state to BOTH paths: site/assets and assets (root)
    const stateJSON = JSON.stringify(state, null, 2);
    blobs.set('site/assets/data/site-state.json', Buffer.from(stateJSON));
    blobs.set('assets/data/site-state.json', Buffer.from(stateJSON));

    if (REGENERATE_CATEGORY_INDEX) {
      const catIndexPath = unit.pagePath.replace(/\/$/, '') + '/index.html';
      const html = generateCategoryIndex(category, state, units);
      blobs.set(`site${catIndexPath}`, Buffer.from(html));
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
  const units = await loadUnits();
  const unit = units.byId[category];
  if (!unit) return json(400, { message: 'Unknown category' });

  const slots = Number(unit.slots) || 1;
  if (!slot || slot < 1 || slot > slots) return json(400, { message: 'Invalid slot' });

  const { owner, repo } = parseRepo();
  const branch = await getBranch();

  const slotDir = `site/${unit.baseOut}/presentation-${String(slot).padStart(2, '0')}/`;

  const headTree = await getHeadTree(owner, repo, branch);
  const paths = (headTree.tree || []).map(n => n.path);
  const toDelete = paths.filter(p => p.startsWith(slotDir));

  const blobs = new Map();
  for (const p of toDelete) blobs.set(p, DELETE);

  const state = await fetchStateFromRepo(owner, repo, branch, units);
  ensureStateShape(state, units);
  ensureArraySize(state.categories[category].titles, slots);
  ensureArraySize(state.categories[category].links,  slots);
  state.categories[category].titles[slot - 1] = '';
  state.categories[category].links[slot - 1]  = '';
  state.updated = new Date().toISOString();

  // Mirror state to BOTH paths: site/assets and assets (root)
  const stateJSON = JSON.stringify(state, null, 2);
  blobs.set('site/assets/data/site-state.json', Buffer.from(stateJSON));
  blobs.set('assets/data/site-state.json', Buffer.from(stateJSON));

  if (REGENERATE_CATEGORY_INDEX) {
    const catIndexPath = unit.pagePath.replace(/\/$/, '') + '/index.html';
    const html = generateCategoryIndex(category, state, units);
    blobs.set(`site${catIndexPath}`, Buffer.from(html));
  }

  const commitSha = await commitTreeWithRetry(owner, repo, branch, blobs, `Delete ${category} #${slot}`);
  return json(200, { ok: true, deleted: true, commit: commitSha });
}

// ---------- Auth helper ----------
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
    for (const n of SESSION_COOKIE_NAMES) { token = getCookie(cookieHeader, n); if (token) break; }
    if (!token) return false;

    const dot = token.indexOf('.');
    if (dot <= 0) return false;
    const payloadB64 = token.slice(0, dot);
    const sigB64 = token.slice(dot + 1);

    const payloadBuf = b64urlDecode(payloadB64);
    let data; try { data = JSON.parse(payloadBuf.toString('utf8')); } catch { return false; }
    if (!data || typeof data.exp !== 'number') return false;

    const now = Math.floor(Date.now() / 1000);
    if (data.exp <= now) return false;

    const expected = crypto.createHmac('sha256', secret).update(payloadBuf).digest();
    const actual = b64urlDecode(sigB64);
    if (expected.length !== actual.length) return false;
    return crypto.timingSafeEqual(expected, actual);
  } catch { return false; }
}

// ---------- Units loader ----------
async function loadUnits(){
  const liveUrl = (process.env.PUBLIC_SITE_URL || '').replace(/\/$/,'');
  try{
    if (liveUrl) {
      const r = await fetch(`${liveUrl}/assets/data/units.json`, { headers:{ 'Cache-Control':'no-cache' } });
      if (r.ok) return normalizeUnits(await r.json());
    }
  }catch{}
  try{
    const { owner, repo } = parseRepo();
    const res = await fetch(`${GH_API}/repos/${owner}/${repo}/contents/site/assets/data/units.json`, { headers: ghHeaders() });
    if (res.ok) {
      const j = await res.json();
      const content = Buffer.from(j.content || '', 'base64').toString('utf8');
      return normalizeUnits(JSON.parse(content));
    }
  }catch{}
  return normalizeUnits({ units: [] });
}
function normalizeUnits(data){
  const arr = Array.isArray(data.units) ? data.units : [];
  const byId = Object.create(null);
  for (const u of arr) {
    if (!u || !u.id) continue;
    byId[u.id] = {
      id: String(u.id),
      title: String(u.title || ''),
      section: String(u.section || ''),
      baseOut: String(u.baseOut || ''),
      slots: Number(u.slots || 0),
      pagePath: String(u.pagePath || '')
    };
  }
  return { list: arr, byId };
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
    const status = err && (err.status || err.statusCode);
    const isNAFF = msg.includes('not a fast forward') || (status === 409) || (status === 422 && msg.includes('/git/refs/heads'));
    const isRate = status === 403 && /secondary rate/i.test(msg);
    const is5xx  = status && status >= 500;
    const isGateway = status === 502 || status === 503 || status === 504;

    if (attempt < 3 && (isNAFF || isRate || is5xx || isGateway)) {
      await sleep(1500 * (attempt + 1));
      return await commitTreeWithRetry(owner, repo, branch, pathToBufferMap, message, attempt + 1);
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
  if (!res.ok) { const txt = await safeText(res); const e = new Error(`GitHub GET ${path} ${res.status} ${txt}`); e.status = res.status; throw e; }
  return res.json();
}
async function ghPOST(path, body) {
  const res = await fetch(`${GH_API}${path}`, { method:'POST', headers: ghHeaders(), body: JSON.stringify(body||{}) });
  if (!res.ok) { const txt = await safeText(res); const e = new Error(`GitHub POST ${path} ${res.status} ${txt}`); e.status = res.status; throw e; }
  return res.json();
}
async function ghPATCH(path, body) {
  const res = await fetch(`${GH_API}${path}`, { method:'PATCH', headers: ghHeaders(), body: JSON.stringify(body||{}) });
  if (!res.ok) { const txt = await safeText(res); const e = new Error(`GitHub PATCH ${path} ${res.status} ${txt}`); e.status = res.status; throw e; }
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

// ---------- State + page helpers ----------
// Fetch state from repo only (for commit operations - ensures latest committed state)
async function fetchStateFromRepo(owner, repo, branch, units) {
  try {
    const res = await fetch(`${GH_API}/repos/${owner}/${repo}/contents/site/assets/data/site-state.json?ref=${encodeURIComponent(branch)}`, { headers: ghHeaders() });
    if (res.ok) {
      const json = await res.json();
      const content = Buffer.from(json.content || '', 'base64').toString('utf8');
      return JSON.parse(content);
    }
  } catch {}
  const state = { version: 'v1', updated: '', categories: {} };
  ensureStateShape(state, units);
  return state;
}

// Fetch state from live site or repo (for read operations)
async function fetchStateFromLiveOrRepo(owner, repo, branch, units) {
  try {
    const base = process.env.PUBLIC_SITE_URL;
    if (base) {
      const res = await fetch(`${base}/assets/data/site-state.json`, { headers: { 'Cache-Control':'no-cache' } });
      if (res.ok) return await res.json();
    }
  } catch {}
  return fetchStateFromRepo(owner, repo, branch, units);
}
function ensureStateShape(state, units){
  if(!state||typeof state!=='object') state={version:'v1',updated:'',categories:{}};
  if(!state.categories) state.categories={};
  for(const u of units.list){
    if(!u || !u.id) continue;
    if(!state.categories[u.id]) state.categories[u.id] = { slots: Number(u.slots)||0, titles: [], links: [] };
  }
}

// Merge states: preserve non-empty titles/links from existing state
function mergeState(existing, next, units){
  const merged = { 
    version: next.version || existing.version || 'v1',
    updated: next.updated || existing.updated || '',
    categories: {}
  };
  
  for(const u of units.list){
    if(!u || !u.id) continue;
    const id = u.id;
    const slots = Number(u.slots) || 0;
    
    const existCat = existing.categories && existing.categories[id] || { titles: [], links: [] };
    const nextCat = next.categories && next.categories[id] || { titles: [], links: [] };
    
    const mergedTitles = [];
    const mergedLinks = [];
    
    for(let i = 0; i < slots; i++){
      const existTitle = (existCat.titles && existCat.titles[i] || '').trim();
      const nextTitle = (nextCat.titles && nextCat.titles[i] || '').trim();
      const existLink = (existCat.links && existCat.links[i] || '').trim();
      const nextLink = (nextCat.links && nextCat.links[i] || '').trim();
      
      // Prefer next if non-empty, otherwise keep existing
      mergedTitles.push(nextTitle || existTitle);
      mergedLinks.push(nextLink || existLink);
    }
    
    merged.categories[id] = { slots, titles: mergedTitles, links: mergedLinks };
  }
  
  return merged;
}
function redirectIndexHtml(title, targetRel, unitPagePath, section){
  // Use shared theme + nav injection; also render an inline nav as fallback using glass buttons
  const secReturn = section==='life-skills' ? '/life-skills/' : '/language-arts/';
  const unitHref = (unitPagePath || '').replace(/\/?$/,'/');

  const head = `
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="/assets/css/theme.css"/>
  <script src="/assets/js/section-nav.js" defer></script>`;

  const nav = `
  <div class="glass-nav">
    <div class="left">
      <a class="btn" href="/">Home</a>
      <a class="btn" href="${secReturn}">Back to ${section==='life-skills'?'Life Skills':'Language Arts'}</a>
    </div>
    <div class="right">
      <a class="btn" href="${unitHref}">Back to unit</a>
    </div>
  </div>`;

  if(!targetRel){
    return `<!DOCTYPE html><html lang="en"><head>${head}</head>
    <body>
      ${nav}
      <main style="max-width:960px;margin:6rem auto 2rem;padding:1rem;color:#fff">
        No entry HTML found in this slot yet.
      </main>
    </body></html>`;
  }

  // Meta refresh redirect; we still show a small message so users see something if it’s slow.
  return `<!DOCTYPE html><html lang="en"><head>
    ${head}
    <meta http-equiv="refresh" content="0; url=${targetRel}"/>
  </head>
  <body>
    ${nav}
    <p style="color:#fff;padding:1rem">Redirecting…</p>
  </body></html>`;
}

// Optional minimal generator (OFF by default)
function generateCategoryIndex(category, state, units){
  const unit = units.byId[category];
  const titles = state?.categories?.[category]?.titles || [];
  const links  = state?.categories?.[category]?.links  || [];
  const items = titles.map((t, i) => {
    const n = String(i+1).padStart(2,'0');
    const href = links[i] || '#';
    const label = (t||'').trim() ? t : `Presentation ${i+1}`;
    const isOpen = !links[i];
    return `<li style="margin:.4rem 0">${isOpen ? `<span style="opacity:.6">${n} — Open</span>` : `<a href="${href}">${n} — ${escapeHtml(label)}</a>`}</li>`;
  }).join('\n');
  const title = unit?.title || 'Presentations';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(title)}</title></head><body style="background:#0b1220;color:#e8edf5;font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif"><div style="max-width:900px;margin:2rem auto;padding:1rem 1.2rem;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.18);border-radius:12px"><h1 style="margin-top:0">${escapeHtml(title)}</h1><ul style="list-style:none;padding:0">${items}</ul></div></body></html>`;
}

// ---------- Entry picker ----------
function pickEntryHtml(owner, repo, branch, incomingBlobs, slotDir){
  const candidates = [];
  for (const [p] of incomingBlobs.entries()) {
    if (p.startsWith(`${slotDir}/`) && p.toLowerCase().endsWith('.html') && p !== `${slotDir}/index.html`) candidates.push(p);
  }
  if (candidates.length) {
    candidates.sort((a,b)=> (a.toLowerCase().endsWith('/index.html')?-1:0) - (b.toLowerCase().endsWith('/index.html')?-1:0) || (a.length-b.length));
    return candidates[0].replace(`${slotDir}/`, '');
  }
  return pickEntryHtmlFromRepo(owner, repo, branch, slotDir.replace(/^site\//,''));
}
async function pickEntryHtmlFromRepo(owner, repo, branch, slotDirNoSitePrefix){
  const tree = await getHeadTree(owner, repo, branch);
  const paths = (tree.tree || []).map(n => n.path);
  const prefix = `site/${slotDirNoSitePrefix}/`;
  const htmls = paths.filter(p => p.startsWith(prefix) && p.toLowerCase().endsWith('.html') && p !== `${prefix}index.html`);
  if (htmls.length) {
    htmls.sort((a,b)=> (a.toLowerCase().endsWith('/index.html')?-1:0) - (b.toLowerCase().endsWith('/index.html')?-1:0) || (a.length-b.length));
    return htmls[0].replace(prefix,'');
  }
  return null;
}

// ---------- Git tree helpers ----------
async function getHeadTree(owner, repo, branch) {
  const head   = await ghGET(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  const commit = await ghGET(`/repos/${owner}/${repo}/git/commits/${head.object.sha}`);
  return ghGET(`/repos/${owner}/${repo}/git/trees/${commit.tree.sha}?recursive=1`);
}

// ---------- Utils ----------
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
function ensureArraySize(arr,n){ while(arr.length<n) arr.push(''); }
function escapeHtml(s=''){return s.replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function shortErr(e){ const msg = e && e.message ? e.message : String(e); return (msg || 'Server error').slice(0, 600); }
function json(status,data){ return { statusCode:status, headers:{'Content-Type':'application/json','Cache-Control':'no-store'}, body: JSON.stringify(data) }; }
function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

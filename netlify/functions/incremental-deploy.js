'use strict';

// Incremental Deploy (GitHub commits) + diagnostics + delete
// Universal, data-driven: reads site/assets/data/units.json to discover units.
// Default: DOES NOT regenerate unit pages (preserves your custom design).
// To opt-in to auto-generation (minimal fallback), set REGENERATE_CATEGORY_INDEX=1.

const crypto = require('crypto');
const { verifySession, createErrorResponse } = require('./_lib/token-utils');
const { requireTeacher } = require('./_lib/auth');

const GH_API = 'https://api.github.com';
const DELETE = Symbol('DELETE');
const REGENERATE_CATEGORY_INDEX = String(process.env.REGENERATE_CATEGORY_INDEX || '').trim() === '1';
const ENABLE_SESSION_LOG = String(process.env.ADMIN_SESSION_LOG || '').trim() === '1';

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

    const sessionCheck = await requireAdmin(event);
    if (!sessionCheck.ok) return sessionCheck.response;

    let body = {};
    try { body = JSON.parse(event.body || '{}'); }
    catch { return json(400, { message: 'Invalid JSON body' }); }

    const { action } = body;
    if (action === 'delete') return await handleDelete(body, sessionCheck.remainingTTL);
    return await handleUpload(body, sessionCheck.remainingTTL);
  } catch (e) {
    console.error('Top-level error:', e && e.stack ? e.stack : e);
    const msg = e && e.message ? String(e.message) : '';
    const status = (e && (e.status || e.statusCode)) ? (e.status || e.statusCode)
                  : (msg.toLowerCase().startsWith('unauthorized') ? 401 : 500);
    return json(status, { message: shortErr(e) });
  }
};

// ---------- Upload ----------
async function handleUpload(body, remainingTTL){
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
    // For student_resources category, generate a reader page instead of a redirect
    if (category === 'student_resources') {
      // Find the primary uploaded file (not index.html)
      let primaryFile = null;
      for (const [p] of blobs.entries()) {
        if (p.startsWith(`${slotDir}/`) && p !== `${slotDir}/index.html`) {
          primaryFile = p.replace(`${slotDir}/`, '');
          break;
        }
      }
      // Also check existing files in repo if not in current batch
      if (!primaryFile) {
        primaryFile = await pickPrimaryResourceFile(owner, repo, branch, slotDir);
      }

      const state = await fetchStateFromRepo(owner, repo, branch, units);
      ensureStateShape(state, units);
      ensureArraySize(state.categories[category].titles, slots);
      ensureArraySize(state.categories[category].links,  slots);

      const existingTitle = state.categories[category].titles[slot - 1] || '';
      const finalTitle = (title && String(title).trim()) ? title : existingTitle;
      if (!finalTitle) return json(400, { message: 'Missing title for final batch' });

      // Generate reader page
      const readerHtml = generateReaderPage(finalTitle, primaryFile);
      blobs.set(`${slotDir}/index.html`, Buffer.from(readerHtml));

      // For TXT files, also generate book-pages.json for inline reader
      if (primaryFile && primaryFile.toLowerCase().endsWith('.txt')) {
        const txtBuf = blobs.get(`${slotDir}/${primaryFile}`);
        if (txtBuf) {
          const bookJson = generateBookPagesJson(finalTitle, txtBuf.toString('utf8'));
          writeBookBlobs(slotDir, bookJson, blobs);
        }
      }

      // For JSON files (Pandoc AST), generate book-pages.json for inline reader
      if (primaryFile && primaryFile.toLowerCase().endsWith('.json')) {
        const jsonBuf = blobs.get(`${slotDir}/${primaryFile}`);
        if (jsonBuf) {
          try {
            const bookJson = parsePandocJsonToBookPages(finalTitle, jsonBuf.toString('utf8'));
            writeBookBlobs(slotDir, bookJson, blobs);
          } catch (e) {
            console.warn('Could not parse Pandoc JSON for book-pages.json:', e.message);
          }
        }
      }

      state.categories[category].titles[slot - 1] = finalTitle;
      state.categories[category].links[slot - 1]  = `/${unit.baseOut}/presentation-${String(slot).padStart(2, '0')}/`;
      state.updated = new Date().toISOString();

      const stateJSON = JSON.stringify(state, null, 2);
      blobs.set('site/assets/data/site-state.json', Buffer.from(stateJSON));
      blobs.set('assets/data/site-state.json', Buffer.from(stateJSON));
    } else {
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
  }

  const message = final
    ? `Upload ${category} #${slot} (final batch)`
    : `Upload ${category} #${slot} (batch)`;

  const commitSha = await commitTreeWithRetry(owner, repo, branch, blobs, message);
  return json(200, { 
    ok: true, 
    commit: commitSha, 
    final: !!final, 
    files: files.length,
    sessionRemainingSeconds: remainingTTL 
  });
}

// ---------- Delete ----------
async function handleDelete(body, remainingTTL){
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
  return json(200, { 
    ok: true, 
    deleted: true, 
    commit: commitSha,
    sessionRemainingSeconds: remainingTTL 
  });
}

// ---------- Auth helper ----------
async function requireAdmin(event){
  // ✅ SSO path: Teacher Center cookie (tc) signed with SESSION_SECRET
  const tcSecret = (process.env.SESSION_SECRET || '').trim();
  if (tcSecret) {
    const tc = requireTeacher(event, tcSecret);

    // requireTeacher() accepts both teacher/admin — we ONLY allow admin into incremental deploy
    if (tc.ok && tc.user && tc.user.role === 'admin') {
      const now = Math.floor(Date.now() / 1000);
      const remainingTTL = (tc.user.exp ? (tc.user.exp - now) : 0);
      return { ok: true, remainingTTL: Math.max(0, remainingTTL) };
    }

    // Logged in but not admin → deny (this is NOT a "session expired" case)
    if (tc.ok && tc.user && tc.user.role !== 'admin') {
      return { ok: false, response: createErrorResponse('FORBIDDEN', 'Admin access required', false, 403) };
    }
  }

  // Fallback: legacy admin cookies (rc_admin_session_v4) signed with ADMIN_SESSION_SECRET
  const secret = (process.env.ADMIN_SESSION_SECRET || '').trim();
  if (!secret) {
    return { ok: false, response: createErrorResponse('SERVER_ERROR', 'Server configuration error', false, 503) };
  }

  const sessionInfo = verifySession(event.headers, secret);

  // ADMIN_KEY header fallback (old tooling)
  if (!sessionInfo.valid) {
    const requiredKey = process.env.ADMIN_KEY;
    if (requiredKey) {
      const hdrs = event.headers || {};
      const sentKey = hdrs['x-admin-key'] || hdrs['X-Admin-Key'] || hdrs['x-Admin-Key'];
      if (sentKey && sentKey === requiredKey) {
        return { ok: true, remainingTTL: 3600 };
      }
    }

    if (ENABLE_SESSION_LOG) console.log('[incremental-deploy] Session verification failed');
    return { ok: false, response: createErrorResponse('SESSION_EXPIRED', 'Session expired or invalid', true, 401) };
  }

  if (sessionInfo.needsUpgrade && ENABLE_SESSION_LOG) {
    console.log('[incremental-deploy] Legacy session detected (version:', sessionInfo.legacyVersion, ')');
  }

  return { ok: true, remainingTTL: sessionInfo.remainingTTL || 0 };
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
  <link rel="stylesheet" href="/assets/css/rc-theme.css"/>
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

// ---------- Primary resource file picker ----------
async function pickPrimaryResourceFile(owner, repo, branch, slotDir) {
  try {
    const tree = await getHeadTree(owner, repo, branch);
    const prefix = slotDir + '/';
    const files = (tree.tree || [])
      .map(n => n.path)
      .filter(p => p.startsWith(prefix) && p !== prefix + 'index.html');
    if (files.length) return files[0].replace(prefix, '');
  } catch {}
  return null;
}

// ---------- Reader page generators ----------
function generateReaderPage(title, primaryFile) {
  const safeTitle = escapeHtml(title);
  const ext = (primaryFile || '').split('.').pop().toLowerCase();

  if (ext === 'epub') {
    return generateEpubReaderPage(safeTitle, primaryFile);
  } else if (ext === 'pdf') {
    return generatePdfReaderPage(safeTitle, primaryFile);
  } else if (ext === 'txt') {
    return generateTxtReaderPage(safeTitle, primaryFile);
  } else {
    return generateDownloadPage(safeTitle, primaryFile);
  }
}

function generateEpubReaderPage(title, filename) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Reinisch Classroom \u2013 Student Portal \u2013 ${title}</title>
<link rel="stylesheet" href="/assets/css/rc-theme.css"/>
<script src="https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js"><\/script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0f172a;color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;height:100vh;overflow:hidden;display:flex;flex-direction:column}
.reader-toolbar{display:flex;align-items:center;gap:12px;padding:10px 16px;background:rgba(15,23,42,0.95);border-bottom:1px solid rgba(255,255,255,0.1);flex-shrink:0;z-index:10}
.reader-toolbar a{color:#60a5fa;text-decoration:none;font-size:13px;display:flex;align-items:center;gap:4px}
.reader-toolbar a:hover{text-decoration:underline}
.reader-title{font-size:16px;font-weight:600;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.reader-btn{padding:6px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.06);color:#f1f5f9;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:6px;white-space:nowrap;transition:background 0.15s}
.reader-btn:hover{background:rgba(255,255,255,0.12)}
.reader-btn.active{background:rgba(59,130,246,0.2);border-color:rgba(59,130,246,0.4);color:#93c5fd}
.reader-body{display:flex;flex:1;overflow:hidden}
.reader-sidebar{width:280px;background:rgba(0,0,0,0.3);border-right:1px solid rgba(255,255,255,0.08);overflow-y:auto;flex-shrink:0;padding:16px 0;transition:margin-left 0.3s ease}
.reader-sidebar.collapsed{margin-left:-280px}
.reader-sidebar h3{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:rgba(255,255,255,0.45);padding:0 16px 10px;border-bottom:1px solid rgba(255,255,255,0.06);margin-bottom:8px}
.toc-item{display:block;padding:8px 16px;color:rgba(255,255,255,0.75);font-size:13px;cursor:pointer;border:none;background:none;width:100%;text-align:left;border-left:3px solid transparent;transition:all 0.15s}
.toc-item:hover{background:rgba(255,255,255,0.06);color:#f1f5f9}
.toc-item.active{border-left-color:#3b82f6;color:#93c5fd;background:rgba(59,130,246,0.08)}
.toc-item.indent{padding-left:32px;font-size:12px}
.reader-content{flex:1;display:flex;flex-direction:column;overflow:hidden;position:relative}
#reader{flex:1;overflow:hidden}
.reader-nav{display:flex;justify-content:center;gap:12px;padding:10px;background:rgba(0,0,0,0.2);border-top:1px solid rgba(255,255,255,0.06);flex-shrink:0}
.reader-nav button{padding:8px 20px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);color:#f1f5f9;font-size:13px;cursor:pointer;transition:background 0.15s}
.reader-nav button:hover{background:rgba(255,255,255,0.12)}
.tts-controls{display:none;align-items:center;gap:8px}
.tts-controls.show{display:flex}
.reader-loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.5);font-size:15px;z-index:5}
#reader iframe{border:none !important}
@media(max-width:768px){
  .reader-sidebar{position:fixed;left:0;top:0;bottom:0;z-index:20;width:260px;margin-left:-260px}
  .reader-sidebar.collapsed{margin-left:-260px}
  .reader-sidebar.open{margin-left:0;box-shadow:4px 0 24px rgba(0,0,0,0.5)}
}
</style>
</head>
<body>
<div class="reader-toolbar">
  <a href="/student/" title="Back to Student Portal">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
    Resources
  </a>
  <div class="reader-title">${title}</div>
  <button class="reader-btn" id="tocToggle" title="Toggle table of contents">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
    Chapters
  </button>
  <button class="reader-btn" id="ttsBtn" title="Read aloud">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>
    Read Aloud
  </button>
  <div class="tts-controls" id="ttsControls">
    <button class="reader-btn" id="ttsPause" title="Pause">\u23f8 Pause</button>
    <button class="reader-btn" id="ttsStop" title="Stop">\u23f9 Stop</button>
  </div>
</div>
<div class="reader-body">
  <aside class="reader-sidebar" id="sidebar">
    <h3>Table of Contents</h3>
    <div id="tocList"><div style="padding:16px;opacity:0.5;font-size:13px">Loading chapters\u2026</div></div>
  </aside>
  <div class="reader-content">
    <div class="reader-loading" id="loadingMsg">Loading book\u2026</div>
    <div id="reader"></div>
    <div class="reader-nav">
      <button id="prevBtn" title="Previous page">\u2190 Previous</button>
      <button id="nextBtn" title="Next page">Next \u2192</button>
    </div>
  </div>
</div>
<script>
(function(){
  var book = ePub('./${filename}');
  var rendition = book.renderTo('reader', {
    width: '100%',
    height: '100%',
    flow: 'paginated',
    spread: 'none'
  });

  rendition.themes.default({
    'body': { 'background': '#1e293b !important', 'color': '#e2e8f0 !important', 'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', 'line-height': '1.7', 'padding': '20px 40px !important', 'font-size': '16px' },
    'p': { 'color': '#e2e8f0 !important', 'line-height': '1.7' },
    'h1,h2,h3,h4,h5,h6': { 'color': '#f1f5f9 !important' },
    'a': { 'color': '#60a5fa !important' },
    'img': { 'max-width': '100% !important' }
  });

  rendition.display().then(function(){
    document.getElementById('loadingMsg').style.display = 'none';
  });

  document.getElementById('prevBtn').addEventListener('click', function(){ rendition.prev(); });
  document.getElementById('nextBtn').addEventListener('click', function(){ rendition.next(); });

  document.addEventListener('keydown', function(e){
    if (e.key === 'ArrowLeft') rendition.prev();
    if (e.key === 'ArrowRight') rendition.next();
  });

  book.loaded.navigation.then(function(nav){
    var tocEl = document.getElementById('tocList');
    if (!nav.toc || !nav.toc.length) {
      tocEl.innerHTML = '<div style="padding:16px;opacity:0.5;font-size:13px">No chapters found<\/div>';
      return;
    }
    var html = '';
    function renderItems(items, depth) {
      items.forEach(function(item){
        var cls = 'toc-item' + (depth > 0 ? ' indent' : '');
        html += '<button class="' + cls + '" data-href="' + item.href + '">' + item.label.trim() + '<\/button>';
        if (item.subitems && item.subitems.length) renderItems(item.subitems, depth + 1);
      });
    }
    renderItems(nav.toc, 0);
    tocEl.innerHTML = html;
    tocEl.querySelectorAll('.toc-item').forEach(function(btn){
      btn.addEventListener('click', function(){
        tocEl.querySelectorAll('.toc-item').forEach(function(b){ b.classList.remove('active'); });
        btn.classList.add('active');
        rendition.display(btn.getAttribute('data-href'));
      });
    });
  });

  var sidebar = document.getElementById('sidebar');
  document.getElementById('tocToggle').addEventListener('click', function(){
    sidebar.classList.toggle('collapsed');
    sidebar.classList.toggle('open');
  });

  var ttsBtn = document.getElementById('ttsBtn');
  var ttsControls = document.getElementById('ttsControls');
  var ttsPause = document.getElementById('ttsPause');
  var ttsStop = document.getElementById('ttsStop');
  var synth = window.speechSynthesis;
  var isSpeaking = false;
  var isPaused = false;

  function getReaderText(){
    var iframe = document.querySelector('#reader iframe');
    if (!iframe || !iframe.contentDocument) return '';
    return iframe.contentDocument.body ? iframe.contentDocument.body.innerText : '';
  }

  ttsBtn.addEventListener('click', function(){
    if (!synth) return alert('Text-to-speech is not supported in this browser.');
    if (isSpeaking) {
      synth.cancel();
      isSpeaking = false; isPaused = false;
      ttsBtn.classList.remove('active');
      ttsControls.classList.remove('show');
      return;
    }
    var text = getReaderText();
    if (!text.trim()) return alert('No text found on this page to read aloud.');
    var utter = new SpeechSynthesisUtterance(text);
    utter.rate = 0.9; utter.pitch = 1;
    utter.onend = function(){
      isSpeaking = false; isPaused = false;
      ttsBtn.classList.remove('active');
      ttsControls.classList.remove('show');
    };
    synth.speak(utter);
    isSpeaking = true;
    ttsBtn.classList.add('active');
    ttsControls.classList.add('show');
  });

  ttsPause.addEventListener('click', function(){
    if (isPaused) { synth.resume(); isPaused = false; ttsPause.textContent = '\u23f8 Pause'; }
    else { synth.pause(); isPaused = true; ttsPause.textContent = '\u25b6 Resume'; }
  });

  ttsStop.addEventListener('click', function(){
    synth.cancel();
    isSpeaking = false; isPaused = false;
    ttsBtn.classList.remove('active');
    ttsControls.classList.remove('show');
  });

  rendition.on('relocated', function(){
    if (isSpeaking) {
      synth.cancel();
      isSpeaking = false; isPaused = false;
      ttsBtn.classList.remove('active');
      ttsControls.classList.remove('show');
    }
  });
})();
<\/script>
</body>
</html>`;
}

function generatePdfReaderPage(title, filename) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Reinisch Classroom \u2013 Student Portal \u2013 ${title}</title>
<link rel="stylesheet" href="/assets/css/rc-theme.css"/>
<script src="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js"><\/script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0f172a;color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;height:100vh;overflow:hidden;display:flex;flex-direction:column}
.reader-toolbar{display:flex;align-items:center;gap:12px;padding:10px 16px;background:rgba(15,23,42,0.95);border-bottom:1px solid rgba(255,255,255,0.1);flex-shrink:0;z-index:10}
.reader-toolbar a{color:#60a5fa;text-decoration:none;font-size:13px;display:flex;align-items:center;gap:4px}
.reader-toolbar a:hover{text-decoration:underline}
.reader-title{font-size:16px;font-weight:600;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.reader-btn{padding:6px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.06);color:#f1f5f9;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:6px;white-space:nowrap;transition:background 0.15s}
.reader-btn:hover{background:rgba(255,255,255,0.12)}
.reader-btn.active{background:rgba(59,130,246,0.2);border-color:rgba(59,130,246,0.4);color:#93c5fd}
.reader-body{display:flex;flex:1;overflow:hidden}
.reader-sidebar{width:260px;background:rgba(0,0,0,0.3);border-right:1px solid rgba(255,255,255,0.08);overflow-y:auto;flex-shrink:0;padding:16px 0;transition:margin-left 0.3s ease}
.reader-sidebar.collapsed{margin-left:-260px}
.reader-sidebar h3{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:rgba(255,255,255,0.45);padding:0 16px 10px;border-bottom:1px solid rgba(255,255,255,0.06);margin-bottom:8px}
.toc-item{display:block;padding:8px 16px;color:rgba(255,255,255,0.75);font-size:13px;cursor:pointer;border:none;background:none;width:100%;text-align:left;border-left:3px solid transparent;transition:all 0.15s}
.toc-item:hover{background:rgba(255,255,255,0.06);color:#f1f5f9}
.toc-item.active{border-left-color:#3b82f6;color:#93c5fd;background:rgba(59,130,246,0.08)}
.reader-content{flex:1;display:flex;flex-direction:column;overflow:hidden}
#pdfViewer{flex:1;overflow-y:auto;display:flex;flex-direction:column;align-items:center;gap:12px;padding:16px;background:#1e293b}
#pdfViewer canvas{max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.5);border-radius:4px}
.reader-nav{display:flex;justify-content:center;align-items:center;gap:12px;padding:10px;background:rgba(0,0,0,0.2);border-top:1px solid rgba(255,255,255,0.06);flex-shrink:0}
.reader-nav button{padding:8px 20px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);color:#f1f5f9;font-size:13px;cursor:pointer;transition:background 0.15s}
.reader-nav button:hover{background:rgba(255,255,255,0.12)}
.reader-nav span{font-size:13px;color:rgba(255,255,255,0.6)}
.tts-controls{display:none;align-items:center;gap:8px}
.tts-controls.show{display:flex}
@media(max-width:768px){.reader-sidebar{position:fixed;left:0;top:0;bottom:0;z-index:20;margin-left:-260px}.reader-sidebar.open{margin-left:0;box-shadow:4px 0 24px rgba(0,0,0,0.5)}}
</style>
</head>
<body>
<div class="reader-toolbar">
  <a href="/student/" title="Back to Student Portal">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
    Resources
  </a>
  <div class="reader-title">${title}</div>
  <button class="reader-btn" id="tocToggle" title="Toggle outline">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
    Contents
  </button>
  <button class="reader-btn" id="ttsBtn" title="Read aloud">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>
    Read Aloud
  </button>
  <div class="tts-controls" id="ttsControls">
    <button class="reader-btn" id="ttsPause">\u23f8 Pause</button>
    <button class="reader-btn" id="ttsStop">\u23f9 Stop</button>
  </div>
</div>
<div class="reader-body">
  <aside class="reader-sidebar" id="sidebar">
    <h3>Contents</h3>
    <div id="tocList"><div style="padding:16px;opacity:0.5;font-size:13px">Loading outline\u2026</div></div>
  </aside>
  <div class="reader-content">
    <div id="pdfViewer"></div>
    <div class="reader-nav">
      <button id="prevBtn">\u2190 Previous</button>
      <span id="pageInfo">Page 1</span>
      <button id="nextBtn">Next \u2192</button>
    </div>
  </div>
</div>
<script>
(function(){
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  var pdfDoc = null, currentPage = 1, totalPages = 0;
  var viewer = document.getElementById('pdfViewer');
  var pageInfo = document.getElementById('pageInfo');

  function renderPage(num){
    pdfDoc.getPage(num).then(function(page){
      var scale = Math.min((viewer.clientWidth - 32) / page.getViewport({scale:1}).width, 2);
      var viewport = page.getViewport({scale: scale});
      var canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      viewer.innerHTML = '';
      viewer.appendChild(canvas);
      page.render({canvasContext: canvas.getContext('2d'), viewport: viewport});
      pageInfo.textContent = 'Page ' + num + ' of ' + totalPages;
      currentPage = num;
    });
  }

  pdfjsLib.getDocument('./${filename}').promise.then(function(pdf){
    pdfDoc = pdf;
    totalPages = pdf.numPages;
    renderPage(1);
    return pdf.getOutline();
  }).then(function(outline){
    var tocEl = document.getElementById('tocList');
    if (!outline || !outline.length) {
      tocEl.innerHTML = '<div style="padding:16px;opacity:0.5;font-size:13px">No outline found<\/div>';
      return;
    }
    var html = '';
    function renderItems(items, depth){
      items.forEach(function(item){
        var cls = 'toc-item' + (depth > 0 ? ' indent' : '');
        html += '<button class="' + cls + '" data-dest="' + encodeURIComponent(JSON.stringify(item.dest)) + '">' + item.title + '<\/button>';
        if (item.items && item.items.length) renderItems(item.items, depth + 1);
      });
    }
    renderItems(outline, 0);
    tocEl.innerHTML = html;
    tocEl.querySelectorAll('.toc-item').forEach(function(btn){
      btn.addEventListener('click', function(){
        var dest = JSON.parse(decodeURIComponent(btn.getAttribute('data-dest')));
        pdfDoc.getPageIndex(dest[0]).then(function(idx){ renderPage(idx + 1); });
      });
    });
  }).catch(function(){});

  document.getElementById('prevBtn').addEventListener('click', function(){ if (currentPage > 1) renderPage(currentPage - 1); });
  document.getElementById('nextBtn').addEventListener('click', function(){ if (currentPage < totalPages) renderPage(currentPage + 1); });
  document.addEventListener('keydown', function(e){ if (e.key==='ArrowLeft' && currentPage>1) renderPage(currentPage-1); if (e.key==='ArrowRight' && currentPage<totalPages) renderPage(currentPage+1); });

  var sidebar = document.getElementById('sidebar');
  document.getElementById('tocToggle').addEventListener('click', function(){ sidebar.classList.toggle('collapsed'); sidebar.classList.toggle('open'); });

  var ttsBtn = document.getElementById('ttsBtn'), ttsControls = document.getElementById('ttsControls');
  var ttsPause = document.getElementById('ttsPause'), ttsStop = document.getElementById('ttsStop');
  var synth = window.speechSynthesis, isSpeaking = false, isPaused = false;

  function getPageText(){
    return pdfDoc ? pdfDoc.getPage(currentPage).then(function(p){ return p.getTextContent(); }).then(function(tc){ return tc.items.map(function(i){ return i.str; }).join(' '); }) : Promise.resolve('');
  }

  ttsBtn.addEventListener('click', function(){
    if (!synth) return alert('Text-to-speech not supported.');
    if (isSpeaking){ synth.cancel(); isSpeaking=false; isPaused=false; ttsBtn.classList.remove('active'); ttsControls.classList.remove('show'); return; }
    getPageText().then(function(text){
      if (!text.trim()) return alert('No text found on this page.');
      var utter = new SpeechSynthesisUtterance(text);
      utter.rate = 0.9;
      utter.onend = function(){ isSpeaking=false; isPaused=false; ttsBtn.classList.remove('active'); ttsControls.classList.remove('show'); };
      synth.speak(utter);
      isSpeaking=true; ttsBtn.classList.add('active'); ttsControls.classList.add('show');
    });
  });
  ttsPause.addEventListener('click', function(){ if (isPaused){ synth.resume(); isPaused=false; ttsPause.textContent='\u23f8 Pause'; } else { synth.pause(); isPaused=true; ttsPause.textContent='\u25b6 Resume'; } });
  ttsStop.addEventListener('click', function(){ synth.cancel(); isSpeaking=false; isPaused=false; ttsBtn.classList.remove('active'); ttsControls.classList.remove('show'); });
})();
<\/script>
</body>
</html>`;
}

function generateTxtReaderPage(title, filename) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Reinisch Classroom \u2013 Student Portal \u2013 ${title}</title>
<link rel="stylesheet" href="/assets/css/rc-theme.css"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0f172a;color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;height:100vh;overflow:hidden;display:flex;flex-direction:column}
.reader-toolbar{display:flex;align-items:center;gap:12px;padding:10px 16px;background:rgba(15,23,42,0.95);border-bottom:1px solid rgba(255,255,255,0.1);flex-shrink:0;z-index:10}
.reader-toolbar a{color:#60a5fa;text-decoration:none;font-size:13px;display:flex;align-items:center;gap:4px}
.reader-toolbar a:hover{text-decoration:underline}
.reader-title{font-size:16px;font-weight:600;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.reader-btn{padding:6px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.06);color:#f1f5f9;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:6px;white-space:nowrap;transition:background 0.15s}
.reader-btn:hover{background:rgba(255,255,255,0.12)}
.reader-btn.active{background:rgba(59,130,246,0.2);border-color:rgba(59,130,246,0.4);color:#93c5fd}
.reader-body{display:flex;flex:1;overflow:hidden}
.reader-sidebar{width:260px;background:rgba(0,0,0,0.3);border-right:1px solid rgba(255,255,255,0.08);overflow-y:auto;flex-shrink:0;padding:16px 0;transition:margin-left 0.3s ease}
.reader-sidebar.collapsed{margin-left:-260px}
.reader-sidebar h3{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:rgba(255,255,255,0.45);padding:0 16px 10px;border-bottom:1px solid rgba(255,255,255,0.06);margin-bottom:8px}
.toc-item{display:block;padding:8px 16px;color:rgba(255,255,255,0.75);font-size:13px;cursor:pointer;border:none;background:none;width:100%;text-align:left;border-left:3px solid transparent;transition:all 0.15s}
.toc-item:hover{background:rgba(255,255,255,0.06);color:#f1f5f9}
.toc-item.active{border-left-color:#3b82f6;color:#93c5fd;background:rgba(59,130,246,0.08)}
.reader-content{flex:1;overflow-y:auto;padding:24px 40px;background:#1e293b}
.reader-content p{line-height:1.8;margin-bottom:1em;font-size:16px;color:#e2e8f0;max-width:72ch}
.reader-content .chapter-heading{font-size:20px;font-weight:700;color:#f1f5f9;margin:2em 0 0.6em;padding-top:1em;border-top:1px solid rgba(255,255,255,0.08)}
.tts-controls{display:none;align-items:center;gap:8px}
.tts-controls.show{display:flex}
@media(max-width:768px){.reader-content{padding:16px}.reader-sidebar{position:fixed;left:0;top:0;bottom:0;z-index:20;margin-left:-260px}.reader-sidebar.open{margin-left:0;box-shadow:4px 0 24px rgba(0,0,0,0.5)}}
</style>
</head>
<body>
<div class="reader-toolbar">
  <a href="/student/" title="Back to Student Portal">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
    Resources
  </a>
  <div class="reader-title">${title}</div>
  <button class="reader-btn" id="tocToggle" title="Toggle chapters">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
    Chapters
  </button>
  <button class="reader-btn" id="ttsBtn" title="Read aloud">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>
    Read Aloud
  </button>
  <div class="tts-controls" id="ttsControls">
    <button class="reader-btn" id="ttsPause">\u23f8 Pause</button>
    <button class="reader-btn" id="ttsStop">\u23f9 Stop</button>
  </div>
</div>
<div class="reader-body">
  <aside class="reader-sidebar" id="sidebar">
    <h3>Chapters</h3>
    <div id="tocList"><div style="padding:16px;opacity:0.5;font-size:13px">Loading\u2026</div></div>
  </aside>
  <div class="reader-content" id="textContent">
    <p style="opacity:0.5">Loading text\u2026</p>
  </div>
</div>
<script>
(function(){
  fetch('./${filename}').then(function(r){ return r.text(); }).then(function(text){
    var content = document.getElementById('textContent');
    var tocEl = document.getElementById('tocList');
    var lines = text.split('\\n');
    var html = '';
    var chapters = [];
    var chapterIdx = 0;
    lines.forEach(function(line){
      var trimmed = line.trim();
      if (/^(chapter|part|section|prologue|epilogue|introduction)/i.test(trimmed) && trimmed.length < 120) {
        var id = 'ch-' + (chapterIdx++);
        html += '<h2 class="chapter-heading" id="' + id + '">' + trimmed.replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }) + '<\/h2>';
        chapters.push({id: id, label: trimmed});
      } else if (trimmed) {
        html += '<p>' + trimmed.replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }) + '<\/p>';
      }
    });
    content.innerHTML = html || '<p style="opacity:0.5">No content found.<\/p>';
    if (chapters.length) {
      var tocHtml = chapters.map(function(ch){
        return '<button class="toc-item" data-id="' + ch.id + '">' + ch.label + '<\/button>';
      }).join('');
      tocEl.innerHTML = tocHtml;
      tocEl.querySelectorAll('.toc-item').forEach(function(btn){
        btn.addEventListener('click', function(){
          tocEl.querySelectorAll('.toc-item').forEach(function(b){ b.classList.remove('active'); });
          btn.classList.add('active');
          var el = document.getElementById(btn.getAttribute('data-id'));
          if (el) el.scrollIntoView({behavior:'smooth'});
        });
      });
    } else {
      tocEl.innerHTML = '<div style="padding:16px;opacity:0.5;font-size:13px">No chapters found<\/div>';
    }
  }).catch(function(){ document.getElementById('textContent').innerHTML = '<p style="opacity:0.5">Failed to load text file.<\/p>'; });

  var sidebar = document.getElementById('sidebar');
  document.getElementById('tocToggle').addEventListener('click', function(){ sidebar.classList.toggle('collapsed'); sidebar.classList.toggle('open'); });

  var ttsBtn = document.getElementById('ttsBtn'), ttsControls = document.getElementById('ttsControls');
  var ttsPause = document.getElementById('ttsPause'), ttsStop = document.getElementById('ttsStop');
  var synth = window.speechSynthesis, isSpeaking = false, isPaused = false;

  ttsBtn.addEventListener('click', function(){
    if (!synth) return alert('Text-to-speech not supported.');
    if (isSpeaking){ synth.cancel(); isSpeaking=false; isPaused=false; ttsBtn.classList.remove('active'); ttsControls.classList.remove('show'); return; }
    var text = document.getElementById('textContent').innerText;
    if (!text.trim()) return alert('No text to read aloud.');
    var utter = new SpeechSynthesisUtterance(text);
    utter.rate = 0.9;
    utter.onend = function(){ isSpeaking=false; isPaused=false; ttsBtn.classList.remove('active'); ttsControls.classList.remove('show'); };
    synth.speak(utter);
    isSpeaking=true; ttsBtn.classList.add('active'); ttsControls.classList.add('show');
  });
  ttsPause.addEventListener('click', function(){ if (isPaused){ synth.resume(); isPaused=false; ttsPause.textContent='\u23f8 Pause'; } else { synth.pause(); isPaused=true; ttsPause.textContent='\u25b6 Resume'; } });
  ttsStop.addEventListener('click', function(){ synth.cancel(); isSpeaking=false; isPaused=false; ttsBtn.classList.remove('active'); ttsControls.classList.remove('show'); });
})();
<\/script>
</body>
</html>`;
}

// ---------- Book blobs writer (handles chunking for large books) ----------
function writeBookBlobs(slotDir, bookJson, blobs) {
  if (bookJson.totalPages > PAGES_PER_CHUNK) {
    // Build chunks
    const chunks = [];
    for (let i = 0; i < bookJson.totalPages; i += PAGES_PER_CHUNK) {
      const chunkIdx = Math.floor(i / PAGES_PER_CHUNK);
      const chunkId = String(chunkIdx + 1).padStart(3, '0');
      const startPage = i + 1;
      const endPage = Math.min(i + PAGES_PER_CHUNK, bookJson.totalPages);
      chunks.push({ id: chunkId, startPage, endPage });
      const chunkData = {
        chunkId,
        startPage,
        endPage,
        pages: bookJson.pages.slice(i, i + PAGES_PER_CHUNK)
      };
      blobs.set(`${slotDir}/book-chunk-${chunkId}.json`, Buffer.from(JSON.stringify(chunkData)));
    }
    const index = {
      title: bookJson.title,
      author: bookJson.author,
      totalPages: bookJson.totalPages,
      wordsPerPage: bookJson.wordsPerPage,
      chapters: bookJson.chapters,
      chunked: true,
      chunks
    };
    if (bookJson.glossary) index.glossary = bookJson.glossary;
    blobs.set(`${slotDir}/book-index.json`, Buffer.from(JSON.stringify(index)));
  } else {
    blobs.set(`${slotDir}/book-pages.json`, Buffer.from(JSON.stringify(bookJson)));
  }
}

// ---------- Book pages JSON generator ----------
const WORDS_PER_PAGE = 250;
const PAGES_PER_CHUNK = 50; // pages per chunk file for large books
const MAX_CHAPTER_HEADING_LENGTH = 120; // Headings longer than this are likely body text
const CHAPTER_RE = /^(chapter|part|section|prologue|epilogue|introduction)/i;

function generateBookPagesJson(title, rawText) {
  const lines = rawText.split(/\r?\n/);
  const pages = [];
  const chapters = [];

  // Current page state
  let currentChapter = '';
  let currentParagraphs = [];
  let currentWordCount = 0;

  function flushPage() {
    if (currentParagraphs.length === 0) return;
    pages.push({
      pageNum: pages.length + 1,
      chapter: currentChapter,
      paragraphs: currentParagraphs.slice()
    });
    currentParagraphs = [];
    currentWordCount = 0;
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // Empty line = paragraph break (flush paragraph, not page)
    if (!trimmed) continue;

    // Chapter heading detection
    if (CHAPTER_RE.test(trimmed) && trimmed.length < MAX_CHAPTER_HEADING_LENGTH) {
      // Start new page for chapter heading
      flushPage();
      currentChapter = trimmed;
      chapters.push({ label: trimmed, startPage: pages.length + 1 });
      // Add the heading as first paragraph of new page
      currentParagraphs.push([trimmed]);
      currentWordCount += trimmed.split(/\s+/).length;
      continue;
    }

    // Skip piracy/watermark lines
    if (/^oceanofpdf/i.test(trimmed)) continue;

    // Regular paragraph — split into words
    const words = trimmed.split(/\s+/).filter(Boolean);
    if (!words.length) continue;

    // Check if adding this paragraph would exceed the page limit
    if (currentWordCount + words.length > WORDS_PER_PAGE && currentParagraphs.length > 0) {
      flushPage();
    }

    currentParagraphs.push(words);
    currentWordCount += words.length;
  }

  // Flush any remaining content
  flushPage();

  return {
    title,
    totalPages: pages.length,
    wordsPerPage: WORDS_PER_PAGE,
    chapters,
    pages
  };
}

// ---------- Pandoc JSON AST parser ----------
function extractMetaString(metaValue) {
  if (!metaValue) return '';
  if (metaValue.t === 'MetaInlines') {
    const parts = [];
    for (const el of (metaValue.c || [])) {
      if (el.t === 'Str') parts.push(el.c);
    }
    return parts.join(' ').trim();
  }
  if (metaValue.t === 'MetaString') return metaValue.c || '';
  if (metaValue.t === 'MetaList') {
    return (metaValue.c || []).map(extractMetaString).filter(Boolean).join(', ');
  }
  if (metaValue.t === 'MetaBlocks') {
    const parts = [];
    for (const block of (metaValue.c || [])) {
      if (block.t === 'Para' || block.t === 'Plain') {
        const words = [];
        for (const el of (block.c || [])) {
          if (el.t === 'Str') words.push(el.c);
        }
        if (words.length) parts.push(words.join(' '));
      }
    }
    return parts.join(' ').trim();
  }
  return '';
}

function parsePandocJsonToBookPages(title, jsonString) {
  let doc;
  try { doc = JSON.parse(jsonString); } catch (e) { throw new Error('Invalid JSON: ' + e.message); }
  if (!doc['pandoc-api-version'] || !Array.isArray(doc.blocks)) {
    throw new Error('Not a valid Pandoc JSON AST (missing pandoc-api-version or blocks)');
  }

  // Extract title/author from meta
  let bookTitle = title;
  let bookAuthor = '';
  if (doc.meta) {
    const mt = extractMetaString(doc.meta.title);
    if (mt) bookTitle = mt;
    const ma = extractMetaString(doc.meta.author);
    if (ma) bookAuthor = ma;
  }

  // Flatten Pandoc inline elements into a words array
  function flattenInlines(inlines, words) {
    if (!Array.isArray(inlines)) return;
    for (let i = 0; i < inlines.length; i++) {
      const el = inlines[i];
      if (!el || !el.t) continue;
      switch (el.t) {
        case 'Str':
          if (el.c) words.push(el.c);
          break;
        case 'Space':
        case 'SoftBreak':
        case 'LineBreak':
          break; // word separators — Str elements are already individual tokens
        case 'Span': {
          const attrs = el.c[0] || [null, [], []];
          const classes = attrs[1] || [];
          const spanInlines = el.c[1] || [];
          if (classes.includes('first-in-chapter1') || classes.includes('drop-cap')) {
            // Drop-cap: collect the letter from the Span, then glue the next sibling Str
            const spanWords = [];
            flattenInlines(spanInlines, spanWords);
            const letter = spanWords.join('');
            if (letter && i + 1 < inlines.length && inlines[i + 1].t === 'Str') {
              i++;
              words.push(letter + inlines[i].c);
            } else if (letter) {
              words.push(letter);
            }
          } else {
            flattenInlines(spanInlines, words);
          }
          break;
        }
        case 'Emph':
        case 'Strong':
        case 'Strikeout':
        case 'Superscript':
        case 'Subscript':
        case 'SmallCaps':
          flattenInlines(el.c || [], words);
          break;
        case 'Quoted': {
          const quoteType = el.c[0] && el.c[0].t;
          const openQ = quoteType === 'SingleQuote' ? '\u2018' : '\u201C';
          const closeQ = quoteType === 'SingleQuote' ? '\u2019' : '\u201D';
          const startIdx = words.length;
          flattenInlines(el.c[1] || [], words);
          if (words.length > startIdx) {
            words[startIdx] = openQ + words[startIdx];
            words[words.length - 1] = words[words.length - 1] + closeQ;
          }
          break;
        }
        case 'Link':
          flattenInlines(el.c[1] || [], words);
          break;
        case 'Code':
          if (el.c && el.c[1]) words.push(el.c[1]);
          break;
        case 'Math':
          if (el.c && el.c[1]) words.push(el.c[1]);
          break;
        case 'RawInline':
        case 'Image':
        case 'Note':
          break; // skip decorative
        default:
          // Generic fallback: recurse if c[1] is an inline array
          if (Array.isArray(el.c)) {
            if (el.c.length >= 2 && Array.isArray(el.c[1]) && el.c[1].length > 0 && el.c[1][0] && el.c[1][0].t) {
              flattenInlines(el.c[1], words);
            } else if (el.c.length > 0 && el.c[0] && el.c[0].t) {
              flattenInlines(el.c, words);
            }
          }
      }
    }
  }

  const pages = [];
  const chapters = [];
  let currentChapter = '';
  let currentParagraphs = [];
  let currentWordCount = 0;
  let foundFirstHeader = false;
  let skipSection = false; // true while inside a ToC-like section
  let inGlossary = false;  // true while processing the Glossary section
  const glossaryEntries = []; // { term, definition }
  let pendingGlossaryTerm = null; // term text waiting for its definition paragraph

  function flushPage() {
    if (currentParagraphs.length === 0) return;
    pages.push({
      pageNum: pages.length + 1,
      chapter: currentChapter,
      paragraphs: currentParagraphs.slice()
    });
    currentParagraphs = [];
    currentWordCount = 0;
  }

  // Iterative block processor — avoids deep recursion on large Pandoc ASTs
  const blockStack = [];
  for (let i = doc.blocks.length - 1; i >= 0; i--) blockStack.push(doc.blocks[i]);

  while (blockStack.length > 0) {
    const block = blockStack.pop();
    if (!block || !block.t) continue;
    switch (block.t) {
      case 'Header': {
        const level = block.c[0];
        const hInlines = block.c[2] || [];
        const hWords = [];
        flattenInlines(hInlines, hWords);
        const headerText = hWords.join(' ').trim();
        if (!headerText) break;

        // Determine whether this header acts as a chapter marker:
        // - level 1: always a chapter marker
        // - level 2: always a chapter marker (many EPUBs use h2 for chapter titles)
        // - level 3: only if it matches the CHAPTER_RE pattern
        // - level 4+: rendered as sub-headings
        const isChapterMarker = level <= 2 || (level === 3 && CHAPTER_RE.test(headerText));

        if (isChapterMarker) {
          // Entering a new chapter header ends any prior skipSection / glossary mode
          skipSection = false;
          inGlossary = false;
          pendingGlossaryTerm = null;
          // If ToC header, skip its content until next chapter header
          if (/^(table of contents|contents)$/i.test(headerText)) {
            skipSection = true;
            foundFirstHeader = true;
            break;
          }
          // If Glossary header, switch to glossary-collection mode
          if (/^glossary$/i.test(headerText)) {
            flushPage();
            foundFirstHeader = true;
            inGlossary = true;
            break;
          }
          // Real chapter
          flushPage();
          foundFirstHeader = true;
          currentChapter = headerText;
          chapters.push({ label: headerText, startPage: pages.length + 1 });
          currentParagraphs.push([headerText]);
          currentWordCount += hWords.filter(Boolean).length;
          break;
        }

        // Sub-heading (level 3 not matching CHAPTER_RE, or level 4+)
        if (!foundFirstHeader || skipSection) break;
        currentParagraphs.push(['## ' + headerText]);
        currentWordCount += hWords.filter(Boolean).length;
        break;
      }
      case 'Para':
      case 'Plain': {
        if (!foundFirstHeader || skipSection) break;
        const words = [];
        flattenInlines(block.c || [], words);
        const filtered = words.filter(Boolean);
        if (!filtered.length) break;
        // Skip piracy/watermark paragraphs
        if (/^oceanofpdf/i.test(filtered.join(' '))) break;
        // In glossary mode, parse entries
        if (inGlossary) {
          const rawText = filtered.join(' ');
          // Check for inline "Term — Definition" or "Term: Definition" pattern
          const inlineMatch = rawText.match(/^(.+?)\s*(?:—|-{1,2}|:)\s+(.+)$/);
          if (inlineMatch) {
            if (pendingGlossaryTerm) {
              // flush pending term with no definition
              glossaryEntries.push({ term: pendingGlossaryTerm, definition: '' });
              pendingGlossaryTerm = null;
            }
            glossaryEntries.push({ term: inlineMatch[1].trim(), definition: inlineMatch[2].trim() });
          } else if (pendingGlossaryTerm) {
            // Previous para was a bare term; this para is the definition
            glossaryEntries.push({ term: pendingGlossaryTerm, definition: rawText });
            pendingGlossaryTerm = null;
          } else {
            // Treat this para as a standalone term (definition may follow)
            pendingGlossaryTerm = rawText;
          }
          break;
        }
        if (currentWordCount + filtered.length > WORDS_PER_PAGE && currentParagraphs.length > 0) {
          flushPage();
        }
        currentParagraphs.push(filtered);
        currentWordCount += filtered.length;
        break;
      }
      case 'Div': {
        const children = block.c[1];
        if (!Array.isArray(children)) break;
        // Only push children if the Div contains meaningful content
        if (children.some(b => b.t === 'Header' || b.t === 'Para' || b.t === 'Plain' || b.t === 'Div' || b.t === 'BulletList' || b.t === 'OrderedList' || b.t === 'BlockQuote')) {
          for (let i = children.length - 1; i >= 0; i--) blockStack.push(children[i]);
        }
        break;
      }
      case 'BlockQuote': {
        const children = block.c || [];
        for (let i = children.length - 1; i >= 0; i--) blockStack.push(children[i]);
        break;
      }
      case 'BulletList': {
        if (!foundFirstHeader || skipSection) break;
        for (const item of (block.c || [])) {
          if (Array.isArray(item)) {
            for (let i = item.length - 1; i >= 0; i--) blockStack.push(item[i]);
          }
        }
        break;
      }
      case 'OrderedList': {
        if (!foundFirstHeader || skipSection) break;
        const items = block.c[1] || [];
        for (const item of items) {
          if (Array.isArray(item)) {
            for (let i = item.length - 1; i >= 0; i--) blockStack.push(item[i]);
          }
        }
        break;
      }
      case 'Image':
      case 'RawBlock':
      case 'Table':
      case 'HorizontalRule':
      case 'Null':
        break; // skip decorative
      default:
        break;
    }
  }
  // Flush any pending glossary term
  if (pendingGlossaryTerm) {
    glossaryEntries.push({ term: pendingGlossaryTerm, definition: '' });
  }
  flushPage();

  const result = {
    title: bookTitle,
    author: bookAuthor,
    totalPages: pages.length,
    wordsPerPage: WORDS_PER_PAGE,
    chapters,
    pages
  };
  if (glossaryEntries.length > 0) result.glossary = glossaryEntries;
  return result;
}

function generateDownloadPage(title, filename) {
  const ext = (filename || '').split('.').pop().toUpperCase();
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Reinisch Classroom \u2013 Student Portal \u2013 ${title}</title>
<link rel="stylesheet" href="/assets/css/rc-theme.css"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0f172a;color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;min-height:100vh;display:flex;flex-direction:column}
.reader-toolbar{display:flex;align-items:center;gap:12px;padding:10px 16px;background:rgba(15,23,42,0.95);border-bottom:1px solid rgba(255,255,255,0.1)}
.reader-toolbar a{color:#60a5fa;text-decoration:none;font-size:13px;display:flex;align-items:center;gap:4px}
.reader-toolbar a:hover{text-decoration:underline}
.reader-title{font-size:16px;font-weight:600;flex:1}
.download-area{flex:1;display:flex;align-items:center;justify-content:center;padding:40px 20px}
.download-card{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:16px;padding:40px;text-align:center;max-width:480px}
.download-icon{font-size:64px;margin-bottom:16px}
.download-card h2{font-size:20px;margin-bottom:8px}
.download-card p{color:rgba(255,255,255,0.6);font-size:14px;margin-bottom:24px;line-height:1.6}
.download-btn{display:inline-flex;align-items:center;gap:8px;padding:12px 28px;border-radius:10px;background:#3b82f6;color:#fff;text-decoration:none;font-size:15px;font-weight:600;transition:background 0.15s}
.download-btn:hover{background:#2563eb}
</style>
</head>
<body>
<div class="reader-toolbar">
  <a href="/student/" title="Back to Student Portal">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
    Resources
  </a>
  <div class="reader-title">${title}</div>
</div>
<div class="download-area">
  <div class="download-card">
    <div class="download-icon">\ud83d\udcce</div>
    <h2>${title}</h2>
    <p>This ${ext} file cannot be previewed directly in the browser. Click below to download it and open it with the appropriate application.</p>
    <a class="download-btn" href="./${filename}" download>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
      Download ${ext} File
    </a>
  </div>
</div>
</body>
</html>`;
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
function ensureArraySize(arr,n){ while(arr.length<n) arr.push(''); }
function escapeHtml(s=''){return s.replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function shortErr(e){ const msg = e && e.message ? e.message : String(e); return (msg || 'Server error').slice(0, 600); }
function json(status,data){ return { statusCode:status, headers:{'Content-Type':'application/json','Cache-Control':'no-store'}, body: JSON.stringify(data) }; }
function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

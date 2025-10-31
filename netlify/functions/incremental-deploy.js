// Incremental Deploy (GitHub commits) + diagnostics + backfill + publisher migration
// Auth: Allows if EITHER a valid admin session cookie is present OR the legacy ADMIN_KEY matches.
// If ADMIN_KEY is not set, only session-based auth works.
//
// Required envs (Netlify → Project configuration → Environment variables):
// - GITHUB_TOKEN     (classic PAT with repo scope, or fine‑grained with Contents RW on the repo)
// - GH_REPO          (e.g., "danreinisch/reinisch-classroom")
// - GH_BRANCH        (e.g., "main")  [optional; defaults to repo default branch]
// - PUBLIC_SITE_URL  (e.g., "https://reinischclassroom.com")
// - ADMIN_SESSION_SECRET (required for session-based auth; same value used by login)
//
// Optional:
// - ADMIN_KEY        (if set, requests may also send header x-admin-key: <value>)

const crypto = require('crypto');

const GH_API = 'https://api.github.com';
const SESSION_COOKIE_NAMES = ['rc_admin_session_v2', 'rc_admin_session'];

exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const action = qs.action || '';

    // Diagnostics and maintenance (GET)
    if (event.httpMethod === 'GET') {
      if (action === 'diagnostics') {
        return json(200, {
          ok: true,
          hasGithubToken: !!process.env.GITHUB_TOKEN,
          ghRepo: process.env.GH_REPO || '',
          ghBranch: process.env.GH_BRANCH || '',
          hasPublicSiteUrl: !!process.env.PUBLIC_SITE_URL
        });
      }

      if (action === 'backfill') {
        await requireAdmin(event);
        return await handleBackfill();
      }

      if (action === 'migrate_publisher') {
        await requireAdmin(event);
        return await handleMigratePublisher();
      }

      return json(200, { ok: true, message: 'Use POST to upload; GET ?action=diagnostics|backfill|migrate_publisher' });
    }

    // Main upload (POST)
    if (event.httpMethod !== 'POST') return json(405, { message: 'Method not allowed' });
    await requireAdmin(event);

    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return json(400, { message: 'Invalid JSON body' }); }

    const { category, slot, title, files, merge, final } = body;

    const CAT_META = {
      toolkit: { slots: 8,  baseOut: 'presentations/language-arts-toolkit', section: 'language-arts', back: '/language-arts/toolkit/index.html' },
      adit:    { slots: 16, baseOut: 'presentations/a-door-into-time',      section: 'language-arts', back: '/language-arts/a-door-into-time/index.html' },
      lik:     { slots: 16, baseOut: 'presentations/lost-in-kragdon-ah',     section: 'language-arts', back: '/language-arts/lost-in-kragdon-ah/index.html' },
      rfk:     { slots: 16, baseOut: 'presentations/return-from-kragdon-ah', section: 'language-arts', back: '/language-arts/return-from-kragdon-ah/index.html' },
      wok:     { slots: 16, baseOut: 'presentations/warrior-of-kragdon-ah',  section: 'language-arts', back: '/language-arts/warrior-of-kragdon-ah/index.html' },
      life:    { slots: 32, baseOut: 'life-skills/presentations',            section: 'life-skills',   back: '/life-skills/index.html' }
    };

    if (!CAT_META[category]) return json(400, { message: 'Unknown category' });
    const cat = CAT_META[category];
    if (!slot || slot < 1 || slot > cat.slots) return json(400, { message: 'Invalid slot' });
    if (!title || !Array.isArray(files) || files.length === 0) return json(400, { message: 'Missing title/files' });

    const { owner, repo } = parseRepo();
    const branch = await getBranch();

    const slotDir = `site/${cat.baseOut}/presentation-${String(slot).padStart(2, '0')}`;
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

    // Add redirect index.html
    const entryRel = await pickEntryHtml(owner, repo, branch, blobs, slotDir);
    const redirectHtml = redirectIndexHtml(title, entryRel, cat.back, cat.section);
    blobs.set(`${slotDir}/index.html`, Buffer.from(redirectHtml));

    // Update site-state.json and category index page
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

    const message = final
      ? `Upload ${category} #${slot} (final batch)`
      : `Upload ${category} #${slot} (batch, merge=${!!merge})`;

    const commitSha = await commitTreeWithRetry(owner, repo, branch, blobs, message);
    return json(200, { ok: true, commit: commitSha, deploy_url: process.env.PUBLIC_SITE_URL || null, final: !!final });
  } catch (e) {
    console.error('Top-level error:', e && e.stack ? e.stack : e);
    const msg = e && e.message ? String(e.message) : '';
    const status = (e && (e.status || e.statusCode)) ? (e.status || e.statusCode)
                  : (msg.toLowerCase().startsWith('unauthorized') ? 401 : 500);
    return json(status, { message: shortErr(e) });
  }
};

// ------------ Auth helper (session cookie OR ADMIN_KEY) ------------
async function requireAdmin(event){
  // 1) Prefer session-based auth
  const secret = (process.env.ADMIN_SESSION_SECRET || '').trim();
  if (secret && verifySessionCookie(event.headers || {}, secret)) {
    return;
  }

  // 2) Backward compatibility: allow ADMIN_KEY if set and matches header
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
    for (const name of SESSION_COOKIE_NAMES) {
      token = getCookie(cookieHeader, name);
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
  } catch {
    return false;
  }
}

function getCookie(header, name) {
  for (const part of header.split(/;\s*/)) {
    const [k, ...v] = part.split('=');
    if (k === name) return v.join('=');
  }
  return '';
}

function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = str.length % 4;
  if (pad) str += '='.repeat(4 - pad);
  return Buffer.from(str, 'base64');
}

// ------------ GitHub helpers ------------
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
      // refresh and retry once
      return await commitTreeWithRetry(owner, repo, branch, pathToBufferMap, message, attempt+1);
    }
    throw err;
  }
}

async function commitTree(owner, repo, branch, pathToBufferMap, message) {
  // 1) Head and base tree
  const head   = await ghGET(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  const commit = await ghGET(`/repos/${owner}/${repo}/git/commits/${head.object.sha}`);
  const baseTreeSha = commit.tree.sha;

  // 2) Create blobs
  const entries = [];
  for (const [path, buf] of pathToBufferMap.entries()) {
    const blob = await ghPOST(`/repos/${owner}/${repo}/git/blobs`, { content: buf.toString('base64'), encoding: 'base64' });
    entries.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
  }

  // 3) Create tree
  const tree = await ghPOST(`/repos/${owner}/${repo}/git/trees`, { base_tree: baseTreeSha, tree: entries });

  // 4) Create commit
  const newCommit = await ghPOST(`/repos/${owner}/${repo}/git/commits`, { message, tree: tree.sha, parents: [head.object.sha] });

  // 5) Move ref
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

// ------------ State and page helpers ------------
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
  for (const [id, meta] of Object.entries({ toolkit:{slots:8}, adit:{slots:16}, lik:{slots:16}, rfk:{slots:16}, wok:{slots:16}, life:{slots:32} })) {
    state.categories[id] = { slots: meta.slots, titles: [], links: [] };
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

function redirectIndexHtml(title, targetRel, backHref, section){
  const getSectionReturn = (s) => s==='life-skills' ? '/life-skills/index.html' : '/language-arts/index.html';
  const navHtml = `<div style="position:fixed;top:1rem;left:1rem;right:1rem;display:flex;justify-content:space-between;z-index:100">
    <a href="/" style="color:#fff;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);padding:.6rem 1rem;border-radius:.6rem;text-decoration:none">Home</a>
    <a href="${getSectionReturn(section)}" style="color:#fff;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);padding:.6rem 1rem;border-radius:.6rem;text-decoration:none">Back to ${section==='life-skills'?'Life Skills':'Language Arts'}</a>
    <a href="${backHref}" style="color:#fff;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);padding:.6rem 1rem;border-radius:.6rem;text-decoration:none">Back to unit</a>
  </div>`;
  if(!targetRel){
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(title)}</title></head><body>${navHtml}<div style="max-width:960px;margin:6rem auto 2rem;padding:1rem;color:#fff">No entry HTML found in this slot yet.</div></body></html>`;
  }
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta http-equiv="refresh" content="0; url=${targetRel}"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(title)}</title></head><body>${navHtml}<p style="color:#fff;padding:1rem">Redirecting…</p></body></html>`;
}

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

function ensureStateShape(state){
  if(!state||typeof state!=='object') state={version:'v1',updated:'',categories:{}};
  if(!state.categories) state.categories={};
  for(const [id, meta] of Object.entries({toolkit:{slots:8},adit:{slots:16},lik:{slots:16},rfk:{slots:16},wok:{slots:16},life:{slots:32}})){
    if(!state.categories[id]) state.categories[id] = { slots: meta.slots, titles: [], links: [] };
  }
}
function escapeHtml(s=''){return s.replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function ensureArraySize(arr,n){ while(arr.length<n) arr.push(''); }
function shortErr(e){ const msg = e && e.message ? e.message : String(e); return (msg || 'Server error').slice(0, 600); }

function json(status,data){ return { statusCode:status, headers:{'Content-Type':'application/json','Cache-Control':'no-store'}, body: JSON.stringify(data) }; }

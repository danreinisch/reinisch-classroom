// Incremental Deploy (GitHub commits version) + diagnostics + backfill + publisher migration
// With clearer error messages, server-side logging, and requireAdmin authorization.
// Commits uploaded files into your repo under site/... so they persist across deploys.
//
// Required envs (Netlify → Project configuration → Environment variables):
// - GITHUB_TOKEN     (classic PAT with repo scope, or fine‑grained with Contents RW on the repo)
// - GH_REPO          (e.g., "danreinisch/reinisch-classroom")
// - GH_BRANCH        (e.g., "main")  [optional; defaults to repo default branch]
// - PUBLIC_SITE_URL  (e.g., "https://reinischclassroom.com")
// Optional:
// - ADMIN_KEY        (if set, requests must send header x-admin-key: <value>)

const crypto = require('crypto');

const CAT_META = {
  toolkit: { slots: 8,  baseOut: 'presentations/language-arts-toolkit', section: 'language-arts', back: '/language-arts/toolkit/index.html' },
  adit:    { slots: 16, baseOut: 'presentations/a-door-into-time',      section: 'language-arts', back: '/language-arts/a-door-into-time/index.html' },
  lik:     { slots: 16, baseOut: 'presentations/lost-in-kragdon-ah',     section: 'language-arts', back: '/language-arts/lost-in-kragdon-ah/index.html' },
  rfk:     { slots: 16, baseOut: 'presentations/return-from-kragdon-ah', section: 'language-arts', back: '/language-arts/return-from-kragdon-ah/index.html' },
  wok:     { slots: 16, baseOut: 'presentations/warrior-of-kragdon-ah',  section: 'language-arts', back: '/language-arts/warrior-of-kragdon-ah/index.html' },
  life:    { slots: 32, baseOut: 'life-skills/presentations',            section: 'life-skills',   back: '/life-skills/index.html' }
};

const GH_API = 'https://api.github.com';

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

    let commitSha;
    try {
      commitSha = await commitTreeWithRetry(owner, repo, branch, blobs, message);
    } catch (err) {
      console.error('Commit error:', err && err.stack ? err.stack : err);
      return json(500, { message: shortErr(err) });
    }

    return json(200, { ok: true, commit: commitSha, deploy_url: process.env.PUBLIC_SITE_URL || null, final: !!final });
  } catch (e) {
    console.error('Top-level error:', e && e.stack ? e.stack : e);
    return json(500, { message: shortErr(e) });
  }
};

// ------------ GET actions ------------
async function handleBackfill(){
  const { owner, repo } = parseRepo();
  const branch = await getBranch();
  const headTree = await getHeadTree(owner, repo, branch);
  const paths = (headTree.tree || []).map(n => n.path);
  const state = buildStateFromPaths(paths);
  await enrichTitlesFromRepo(state, owner, repo, branch);

  const blobs = new Map();
  blobs.set('site/assets/data/site-state.json', Buffer.from(JSON.stringify(state, null, 2)));
  for (const catId of Object.keys(CAT_META)) {
    const p = categoryIndexPath(catId); if (!p) continue;
    blobs.set(`site${p}`, Buffer.from(generateCategoryIndex(catId, state)));
  }

  const commitSha = await commitTreeWithRetry(owner, repo, branch, blobs, `Backfill site state from repo (${new Date().toISOString()})`);
  return json(200, { ok: true, message: 'backfill-complete', commit: commitSha, updated: state.updated });
}

async function handleMigratePublisher(){
  const { owner, repo } = parseRepo();
  const branch = await getBranch();
  const headTree = await getHeadTree(owner, repo, branch);
  const nodes = headTree.tree || [];

  // Legacy source path (A Door Into Time)
  const publisherRoot = 'REINISCHCLASSROOM P U B L I S H E R/LANGUAGE ARTS/A Door Into Time';
  const weekDirs = new Set(
    nodes
      .filter(n => n.type === 'blob' && n.path.startsWith(publisherRoot + '/'))
      .map(n => {
        const parts = n.path.split('/');
        return parts.slice(0, publisherRoot.split('/').length + 1).join('/');
      })
  );

  const toCopy = [];
  const titlesBySlot = {};

  for (const weekDir of Array.from(weekDirs)) {
    const leaf = weekDir.split('/').pop() || '';
    const weekMatch = leaf.match(/Week\s+(\d+)/i);
    if (!weekMatch) continue;
    const slot = Number(weekMatch[1]);
    if (!slot || slot < 1 || slot > CAT_META.adit.slots) continue;

    titlesBySlot[slot] = leaf;
    const files = nodes.filter(n => n.type === 'blob' && n.path.startsWith(weekDir + '/'));
    for (const f of files) {
      const filename = f.path.substring(weekDir.length + 1);
      const dest = `site/${CAT_META.adit.baseOut}/presentation-${String(slot).padStart(2, '0')}/${filename}`;
      toCopy.push({ src: f.path, dst: dest });
    }
  }

  if (toCopy.length === 0) return json(200, { ok: true, message: 'no-publisher-files-found' });

  const blobs = new Map();
  for (const { src, dst } of toCopy) {
    const content = await fetchRepoFile(owner, repo, branch, src);
    blobs.set(dst, content);
  }

  for (const slotStr of Object.keys(titlesBySlot)) {
    const slot = Number(slotStr);
    const entryRel = await pickEntryHtmlFromRepo(owner, repo, branch, `${CAT_META.adit.baseOut}/presentation-${String(slot).padStart(2,'0')}`);
    const redirectHtml = redirectIndexHtml(titlesBySlot[slot] || `Presentation ${slot}`, entryRel, CAT_META.adit.back, CAT_META.adit.section);
    blobs.set(`site/${CAT_META.adit.baseOut}/presentation-${String(slot).padStart(2,'0')}/index.html`, Buffer.from(redirectHtml));
  }

  const state = await fetchStateFromLiveOrRepo(owner, repo, branch);
  ensureStateShape(state);
  ensureArraySize(state.categories.adit.titles, CAT_META.adit.slots);
  ensureArraySize(state.categories.adit.links,  CAT_META.adit.slots);
  for (let i = 1; i <= CAT_META.adit.slots; i++) {
    if (titlesBySlot[i]) {
      state.categories.adit.titles[i-1] = titlesBySlot[i];
      state.categories.adit.links[i-1]  = `/${CAT_META.adit.baseOut}/presentation-${String(i).padStart(2,'0')}/`;
    }
  }
  state.updated = new Date().toISOString();
  blobs.set('site/assets/data/site-state.json', Buffer.from(JSON.stringify(state, null, 2)));
  blobs.set(`site${categoryIndexPath('adit')}`, Buffer.from(generateCategoryIndex('adit', state)));

  const commitSha = await commitTreeWithRetry(owner, repo, branch, blobs, `Migrate publisher content to site structure (ADIT)`);
  return json(200, { ok: true, message: 'migrate-complete', commit: commitSha, migrated: Object.keys(titlesBySlot).length });
}

// ------------ Auth helper ------------
async function requireAdmin(event){
  const requiredKey = process.env.ADMIN_KEY;
  if (!requiredKey) return; // no auth configured
  const hdrs = event.headers || {};
  const sentKey = hdrs['x-admin-key'] || hdrs['X-Admin-Key'] || hdrs['x-Admin-Key'];
  if (!sentKey || sentKey !== requiredKey) {
    throw new Error('Unauthorized (invalid admin key)');
  }
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

async function fetchRepoFile(owner, repo, branch, path) {
  const res = await fetch(`${GH_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`, { headers: ghHeaders() });
  if (!res.ok) throw new Error(`GitHub contents GET ${path} ${res.status} ${await safeText(res)}`);
  const j = await res.json();
  return Buffer.from(j.content || '', 'base64');
}

async function getHeadTree(owner, repo, branch) {
  const head   = await ghGET(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  const commit = await ghGET(`/repos/${owner}/${repo}/git/commits/${head.object.sha}`);
  return ghGET(`/repos/${owner}/${repo}/git/trees/${commit.tree.sha}?recursive=1`);
}

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
  for (const [id, meta] of Object.entries(CAT_META)) {
    state.categories[id] = { slots: meta.slots, titles: [], links: [] };
  }
  return state;
}

function buildStateFromPaths(paths) {
  const state = { version: 'v1', updated: new Date().toISOString(), categories: {} };
  for (const [id, meta] of Object.entries(CAT_META)) {
    const titles = new Array(meta.slots).fill('');
    const links  = new Array(meta.slots).fill('');
    for (let i=1;i<=meta.slots;i++){
      const slotDir = `site/${meta.baseOut}/presentation-${String(i).padStart(2,'0')}/`;
      const hasAny = paths.some(p => p.startsWith(slotDir));
      if (hasAny) {
        links[i-1] = `/${meta.baseOut}/presentation-${String(i).padStart(2,'0')}/`;
        if (!titles[i-1]) titles[i-1] = `Presentation ${i}`;
      }
    }
    state.categories[id] = { slots: meta.slots, titles, links };
  }
  return state;
}

async function enrichTitlesFromRepo(state, owner, repo, branch) {
  const tasks = [];
  for (const [id, meta] of Object.entries(CAT_META)) {
    const titles = state.categories[id].titles;
    const links  = state.categories[id].links;
    for (let i=1;i<=meta.slots;i++){
      if (!links[i-1]) continue;
      const idxPath = `site/${meta.baseOut}/presentation-${String(i).padStart(2,'0')}/index.html`;
      tasks.push((async()=>{
        try{
          const r = await fetch(`${GH_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(idxPath)}?ref=${encodeURIComponent(branch)}`, { headers: ghHeaders() });
          if (!r.ok) return;
          const j = await r.json();
          const html = Buffer.from(j.content || '', 'base64').toString('utf8');
          const m = html.match(/<title>\s*([^<]+)\s*<\/title>/i) || html.match(/<h1[^>]*>\s*([^<]+)\s*<\/h1>/i);
          if (m) titles[i-1] = m[1].trim();
        }catch{}
      })());
    }
  }
  await Promise.all(tasks);
  state.updated = new Date().toISOString();
}

async function pickEntryHtml(owner, repo, branch, incomingBlobs, slotDir){
  const candidates = [];
  for (const [p] of incomingBlobs.entries()) {
    if (p.startsWith(`${slotDir}/`) && p.toLowerCase().endsWith('.html') && p !== `${slotDir}/index.html`) candidates.push(p);
  }
  if (candidates.length) {
    candidates.sort((a,b)=> (a.toLowerCase().endsWith('/index.html')?-1:0) - (b.toLowerCase().endsWith('/index.html')?-1:0) || (a.length-b.length));
    return candidates[0].replace(`${slotDir}/`, '');
  }
  return await pickEntryHtmlFromRepo(owner, repo, branch, slotDir.replace(/^site\//,''));
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

function categoryIndexPath(category){
  return category==='toolkit' ? '/language-arts/toolkit/index.html'
    : category==='life' ? '/life-skills/index.html'
    : ({ adit:'/language-arts/a-door-into-time/index.html', lik:'/language-arts/lost-in-kragdon-ah/index.html', rfk:'/language-arts/return-from-kragdon-ah/index.html', wok:'/language-arts/warrior-of-kragdon-ah/index.html' })[category] || null;
}

function redirectIndexHtml(title, targetRel, backHref, section){
  const getSectionReturn = (s) => s==='life-skills' ? '/life-skills/index.html' : '/language-arts/index.html';
  const navHtml = `<div style="position:fixed;top:1rem;left:1rem;right:1rem;display:flex;justify-content:space-between;z-index:100">
    <a href="/" style="color:#fff;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);padding:.6rem 1rem;border-radius:.6rem;text-decoration:none">Home</a>
    <a href="${getSectionReturn(section)}" style="color:#fff;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);padding:.6rem 1rem;border-radius:.6rem;text-decoration:none">${section==='life-skills'?'Life Skills':'Language Arts'}</a>
  </div>`;
  if(!targetRel){
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(title)}</title></head><body>${navHtml}<div style="display:grid;place-items:center;height:100vh;color:#e8edf5"><div><h1>${escapeHtml(title)}</h1><p>No HTML file was found in this presentation folder.</p><p><a href="${backHref}">Back</a></p></div></div></body></html>`;
  }
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta http-equiv="refresh" content="0; url=${targetRel}"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(title)}</title><script>location.replace(${JSON.stringify(targetRel)});</`+'script></head><body>'+navHtml+'</body></html>';
}

function generateCategoryIndex(catId, state) {
  const cat = CAT_META[catId];
  const titles = (state.categories[catId]?.titles || []).slice(0, cat.slots);
  const links  = (state.categories[catId]?.links  || []).slice(0, cat.slots);
  const cards = titles.map((t, i) => {
    const title = t || `Presentation ${i+1}`;
    const href = links[i] || '#';
    const sub = href && href !== '#' ? 'Open presentation' : 'Placeholder';
    return `<a class="card" href="${href}"><strong>${escapeHtml(title)}</strong><small>${sub}</small></a>`;
  }).join('');
  const pageTitle = catId === 'toolkit' ? 'Language Arts Toolkit'
                   : catId === 'life' ? 'Life Skills'
                   : ({ adit:'A Door Into Time', lik:'Lost in Kragdon-ah', rfk:'Return from Kragdon-ah', wok:'Warrior of Kragdon-ah' }[catId] || 'Language Arts');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(pageTitle)} – Reinisch Classroom</title><style>*{box-sizing:border-box;margin:0;padding:0}:root{--glass:rgba(255,255,255,.14);--glass-brd:rgba(255,255,255,.28);--text:#e8edf5}body{min-height:100vh;font-family:Segoe UI,Roboto,Arial,sans-serif;color:var(--text);background:#0b1220;display:flex;flex-direction:column;align-items:center;text-align:center;padding:2rem}.grid{width:100%;max-width:1100px;display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}.card{background:var(--glass);border:1px solid var(--glass-brd);border-radius:1rem;padding:1rem 1.25rem;color:var(--text);text-decoration:none;min-height:86px;display:flex;flex-direction:column;justify-content:center;align-items:center;box-shadow:0 10px 30px rgba(0,0,0,.15)}</style></head><body><header><h1>${escapeHtml(pageTitle)}</h1><p style="opacity:.9;margin:14px 0 22px">Unit hub</p></header><section class="grid">${cards}</section></body></html>`;
}

// ------------ small helpers ------------
function ensureStateShape(state){ if(!state||typeof state!=='object') state={version:'v1',updated:'',categories:{}}; if(!state.categories) state.categories={}; for(const [id, meta] of Object.entries(CAT_META)){ if(!state.categories[id]) state.categories[id]={slots:meta.slots,titles:[],links:[]}; } }
function escapeHtml(s=''){return s.replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function ensureArraySize(arr,n){ while(arr.length<n) arr.push(''); }
function shortErr(e){ const msg = e && e.message ? e.message : String(e); return (msg || 'Server error').slice(0, 600); }

function ghHeaders(){
  const token = process.env.GITHUB_TOKEN;
  if(!token) throw new Error('Missing GITHUB_TOKEN');
  return { Authorization:`Bearer ${token}`, 'Content-Type':'application/json', 'User-Agent':'reinisch-uploader', Accept:'application/vnd.github+json' };
}
async function safeText(res){ try{ return await res.text(); } catch{ return ''; } }
function json(status,data){ return { statusCode:status, headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) }; }

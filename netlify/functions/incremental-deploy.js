// Incremental Deploy (GitHub commits version)
// - Commits uploaded files into your repo so they persist across deploys
// - Still supports batching from the Admin UI (fewer, larger batches)
// Env vars required:
//   GITHUB_TOKEN  (classic PAT with repo scope)
//   GH_REPO       (e.g., "danreinisch/reinisch-classroom")
//   GH_BRANCH     (e.g., "main")
//   ADMIN_KEY     (optional; if set, require 'x-admin-key' header)
//   PUBLIC_SITE_URL (for reading/writing state if needed)
// Note: Do NOT add SITE_ID in Netlify. Not required for GitHub commits.

const crypto = require('crypto');

const CAT_META = {
  toolkit: { slots: 8,  baseOut: 'language-arts/toolkit/presentations', section: 'language-arts', back: '/language-arts/toolkit/index.html' },
  adit:    { slots: 16, baseOut: 'presentations/a-door-into-time',      section: 'language-arts', back: '/language-arts/a-door-into-time/index.html' },
  lik:     { slots: 16, baseOut: 'presentations/lost-in-kragdon-ah',     section: 'language-arts', back: '/language-arts/lost-in-kragdon-ah/index.html' },
  rfk:     { slots: 16, baseOut: 'presentations/return-from-kragdon-ah', section: 'language-arts', back: '/language-arts/return-from-kragdon-ah/index.html' },
  wok:     { slots: 16, baseOut: 'presentations/warrior-of-kragdon-ah',  section: 'language-arts', back: '/language-arts/warrior-of-kragdon-ah/index.html' },
  life:    { slots: 32, baseOut: 'life-skills/presentations',            section: 'life-skills',   back: '/life-skills/index.html' }
};

const GH_API = 'https://api.github.com';

exports.handler = async (event) => {
  try {
    const action = (event.queryStringParameters && event.queryStringParameters.action) || '';
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
        // Optional in-function auth
        const requiredKey = process.env.ADMIN_KEY;
        if (requiredKey) {
          const hdrs = event.headers || {};
          const sentKey = hdrs['x-admin-key'] || hdrs['X-Admin-Key'] || hdrs['x-Admin-Key'];
          if (!sentKey || sentKey !== requiredKey) return json(401, { message: 'Unauthorized (invalid admin key)' });
        }
        const { owner, repo } = parseRepo();
        const branch = await getBranch();
        const head = await ghGET(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
        const commitSha = head.object.sha;
        const commit = await ghGET(`/repos/${owner}/${repo}/git/commits/${commitSha}`);
        const baseTreeSha = commit.tree.sha;

        // Scan the tree for existing presentations
        const tree = await ghGET(`/repos/${owner}/${repo}/git/trees/${baseTreeSha}?recursive=1`);
        const paths = (tree.tree || []).map(n => n.path);
        const state = buildStateFromPaths(paths);

        // Try to read titles from slot index.html files in repo (best effort)
        await enrichTitlesFromRepo(state, owner, repo, branch);

        // Write state + regenerate category pages
        const blobs = new Map(); // path -> content Buffer
        const shas  = new Map(); // path -> sha
        const statePath = 'site/assets/data/site-state.json';
        const stateBuf  = Buffer.from(JSON.stringify(state, null, 2));
        blobs.set(statePath, stateBuf);
        shas.set(statePath, sha1(stateBuf));

        for (const catId of Object.keys(CAT_META)) {
          const catIndexPath = categoryIndexPath(catId);
          if (!catIndexPath) continue;
          const html = generateCategoryIndex(catId, state);
          const buf = Buffer.from(html);
          const fullPath = `site${catIndexPath}`;
          blobs.set(fullPath, buf);
          shas.set(fullPath, sha1(buf));
        }

        const newCommitSha = await commitTree(owner, repo, branch, blobs, `Backfill state from repository (${new Date().toISOString()})`);
        return json(200, { ok: true, message: 'backfill-complete', commit: newCommitSha, updated: state.updated });
      }

      return json(200, { ok: true, message: 'Use POST to upload; or GET ?action=diagnostics|backfill' });
    }

    if (event.httpMethod !== 'POST') return json(405, { message: 'Method not allowed' });

    // Optional in-function auth
    const requiredKey = process.env.ADMIN_KEY;
    if (requiredKey) {
      const hdrs = event.headers || {};
      const sentKey = hdrs['x-admin-key'] || hdrs['X-Admin-Key'] || hdrs['x-Admin-Key'];
      if (!sentKey || sentKey !== requiredKey) return json(401, { message: 'Unauthorized (invalid admin key)' });
    }

    const body = JSON.parse(event.body || '{}');
    const { category, slot, title, files, merge, final } = body;

    if (!CAT_META[category]) return json(400, { message: 'Unknown category' });
    const cat = CAT_META[category];
    if (!slot || slot < 1 || slot > cat.slots) return json(400, { message: 'Invalid slot' });
    if (!title || !Array.isArray(files) || files.length === 0) return json(400, { message: 'Missing title/files' });

    if (!process.env.GITHUB_TOKEN) return json(500, { message: 'Server not configured: missing GITHUB_TOKEN' });
    const { owner, repo } = parseRepo();
    const branch = await getBranch();

    // Build file map to commit
    const slotDir = `site/${cat.baseOut}/presentation-${String(slot).padStart(2, '0')}`;
    const blobs = new Map(); // path -> Buffer

    for (const f of files) {
      if (!f.path || !f.base64) continue;
      const buf = Buffer.from(f.base64, 'base64');
      let outPath = (f.path || '').replace(/^\/+/, '');
      if (outPath.startsWith('assets/images/')) {
        outPath = `site/${outPath}`;
      } else {
        outPath = `${slotDir}/${outPath}`;
      }
      blobs.set(outPath, buf);
    }

    // Always include redirect index and state/index regeneration (keeps site consistent even if user stops mid-batches)
    const entryRel = await pickEntryHtml(owner, repo, branch, blobs, slotDir);
    const redirectHtml = redirectIndexHtml(title, entryRel, cat.back, cat.section);
    blobs.set(`${slotDir}/index.html`, Buffer.from(redirectHtml));

    // Update state.json and the category index page
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
      const catHtml = generateCategoryIndex(category, state);
      blobs.set(catIndexPath, Buffer.from(catHtml));
    }

    // Commit
    const message = final
      ? `Upload presentation ${category} #${slot} (final batch)`
      : `Upload presentation ${category} #${slot} (batch, merge=${!!merge})`;

    const newCommitSha = await commitTree(owner, repo, branch, blobs, message);

    // Return a URL that will be published by Netlify soon after the GitHub commit
    return json(200, {
      ok: true,
      commit: newCommitSha,
      // This is the site URL; Netlify will build and publish shortly after commit
      deploy_url: process.env.PUBLIC_SITE_URL || null,
      final: !!final
    });
  } catch (e) {
    return json(500, { message: e?.message || 'Server error' });
  }
};

// ---------- GitHub utilities ----------
function parseRepo() {
  const slug = process.env.GH_REPO || '';
  if (!slug || !slug.includes('/')) throw new Error('GH_REPO must be set to "owner/repo"');
  const [owner, repo] = slug.split('/');
  return { owner, repo };
}
async function getBranch() {
  return process.env.GH_BRANCH || await getRepoDefaultBranch();
}
async function getRepoDefaultBranch() {
  const { owner, repo } = parseRepo();
  const info = await ghGET(`/repos/${owner}/${repo}`);
  return info.default_branch || 'main';
}
async function commitTree(owner, repo, branch, pathToBufferMap, message) {
  // 1) Get HEAD commit and base tree
  const head = await ghGET(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  const commitSha = head.object.sha;
  const commit = await ghGET(`/repos/${owner}/${repo}/git/commits/${commitSha}`);
  const baseTreeSha = commit.tree.sha;

  // 2) Create blobs for each file
  const entries = [];
  for (const [path, buf] of pathToBufferMap.entries()) {
    const blob = await ghPOST(`/repos/${owner}/${repo}/git/blobs`, {
      content: buf.toString('base64'),
      encoding: 'base64'
    });
    entries.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
  }

  // 3) Create a new tree
  const tree = await ghPOST(`/repos/${owner}/${repo}/git/trees`, {
    base_tree: baseTreeSha,
    tree: entries
  });

  // 4) Create a commit pointing to the new tree
  const newCommit = await ghPOST(`/repos/${owner}/${repo}/git/commits`, {
    message,
    tree: tree.sha,
    parents: [commitSha]
  });

  // 5) Move the branch ref to the new commit
  await ghPATCH(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
    sha: newCommit.sha,
    force: false
  });

  return newCommit.sha;
}
async function ghGET(path) {
  const res = await fetch(`${GH_API}${path}`, {
    headers: ghHeaders()
  });
  if (!res.ok) throw new Error(`GitHub GET ${path} ${res.status}`);
  return res.json();
}
async function ghPOST(path, body) {
  const res = await fetch(`${GH_API}${path}`, {
    method: 'POST',
    headers: ghHeaders(),
    body: JSON.stringify(body || {})
  });
  if (!res.ok) throw new Error(`GitHub POST ${path} ${res.status} ${await res.text()}`);
  return res.json();
}
async function ghPATCH(path, body) {
  const res = await fetch(`${GH_API}${path}`, {
    method: 'PATCH',
    headers: ghHeaders(),
    body: JSON.stringify(body || {})
  });
  if (!res.ok) throw new Error(`GitHub PATCH ${path} ${res.status} ${await res.text()}`);
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

// ---------- State, pages, and helpers ----------
async function fetchStateFromLiveOrRepo(owner, repo, branch) {
  // Prefer the live site state.json (if present), else read from repo, else start fresh
  try {
    const base = process.env.PUBLIC_SITE_URL;
    if (base) {
      const res = await fetch(`${base}/assets/data/site-state.json`, { headers: { 'Cache-Control': 'no-cache' } });
      if (res.ok) return await res.json();
    }
  } catch {}
  try {
    // Read from repo
    const res = await fetch(`${GH_API}/repos/${owner}/${repo}/contents/site/assets/data/site-state.json?ref=${encodeURIComponent(branch)}`, {
      headers: ghHeaders()
    });
    if (res.ok) {
      const json = await res.json();
      const content = Buffer.from(json.content || '', 'base64').toString('utf8');
      return JSON.parse(content);
    }
  } catch {}
  // Fresh blank state
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
    for (let i = 1; i <= meta.slots; i++) {
      const slotDir = `site/${meta.baseOut}/presentation-${String(i).padStart(2, '0')}/`;
      const hasAny = paths.some(p => p.startsWith(slotDir));
      if (hasAny) {
        links[i - 1] = `/${meta.baseOut}/presentation-${String(i).padStart(2, '0')}/`;
        if (!titles[i - 1]) titles[i - 1] = `Presentation ${i}`;
      }
    }
    state.categories[id] = { slots: meta.slots, titles, links };
  }
  return state;
}

async function enrichTitlesFromRepo(state, owner, repo, branch) {
  // Try to read <title> from each present slot's index.html
  const promises = [];
  for (const [id, meta] of Object.entries(CAT_META)) {
    const titles = state.categories[id].titles;
    const links  = state.categories[id].links;
    for (let i = 1; i <= meta.slots; i++) {
      if (!links[i - 1]) continue;
      const idxPath = `site/${meta.baseOut}/presentation-${String(i).padStart(2, '0')}/index.html`;
      promises.push((async () => {
        try {
          const r = await fetch(`${GH_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(idxPath)}?ref=${encodeURIComponent(branch)}`, {
            headers: ghHeaders()
          });
          if (!r.ok) return;
          const j = await r.json();
          const html = Buffer.from(j.content || '', 'base64').toString('utf8');
          const m = html.match(/<title>\s*([^<]+)\s*<\/title>/i) || html.match(/<h1[^>]*>\s*([^<]+)\s*<\/h1>/i);
          if (m) titles[i - 1] = m[1].trim();
        } catch {}
      })());
    }
  }
  await Promise.all(promises);
  state.updated = new Date().toISOString();
}

async function pickEntryHtml(owner, repo, branch, incomingBlobs, slotDir) {
  // Prefer an .html in this batch; otherwise check repo for an existing one
  const candidates = [];
  for (const [p] of incomingBlobs.entries()) {
    if (p.startsWith(`${slotDir}/`) && p.toLowerCase().endsWith('.html') && p !== `${slotDir}/index.html`) {
      candidates.push(p);
    }
  }
  if (candidates.length) {
    candidates.sort((a, b) => (a.toLowerCase().endsWith('/index.html') ? -1 : 0) - (b.toLowerCase().endsWith('/index.html') ? -1 : 0) || (a.length - b.length));
    return candidates[0].replace(`${slotDir}/`, '');
  }
  // Look in repo
  try {
    const tree = await getHeadTree(owner, repo, branch);
    const paths = (tree.tree || []).map(n => n.path);
    const htmls = paths.filter(p => p.startsWith(`${slotDir}/`) && p.toLowerCase().endsWith('.html') && p !== `${slotDir}/index.html`);
    if (htmls.length) {
      htmls.sort((a, b) => (a.toLowerCase().endsWith('/index.html') ? -1 : 0) - (b.toLowerCase().endsWith('/index.html') ? -1 : 0) || (a.length - b.length));
      return htmls[0].replace(`${slotDir}/`, '');
    }
  } catch {}
  return null;
}

async function getHeadTree(owner, repo, branch) {
  const head = await ghGET(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  const commit = await ghGET(`/repos/${owner}/${repo}/git/commits/${head.object.sha}`);
  return ghGET(`/repos/${owner}/${repo}/git/trees/${commit.tree.sha}?recursive=1`);
}

function categoryIndexPath(category) {
  return category === 'toolkit'
    ? '/language-arts/toolkit/index.html'
    : category === 'life'
      ? '/life-skills/index.html'
      : {
          adit: '/language-arts/a-door-into-time/index.html',
          lik:  '/language-arts/lost-in-kragdon-ah/index.html',
          rfk:  '/language-arts/return-from-kragdon-ah/index.html',
          wok:  '/language-arts/warrior-of-kragdon-ah/index.html'
        }[category] || null;
}

function redirectIndexHtml(title, targetRel, backHref, section) {
  const getSectionReturn = (section) => {
    if (section === 'life-skills') return '/life-skills/index.html';
    return '/language-arts/index.html';
  };
  const navHtml = `<div style="position:fixed;top:1rem;left:1rem;right:1rem;display:flex;justify-content:space-between;z-index:100">
    <a href="/" style="color:#fff;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);padding:.6rem 1rem;border-radius:.6rem;text-decoration:none">Home</a>
    <a href="${getSectionReturn(section)}" style="color:#fff;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);padding:.6rem 1rem;border-radius:.6rem;text-decoration:none">${section === 'life-skills' ? 'Life Skills' : 'Language Arts'}</a>
  </div>`;
  if (!targetRel) {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(title)}</title></head><body>${navHtml}<div style="display:grid;place-items:center;height:100vh;color:#e8edf5"><div><h1>${escapeHtml(title)}</h1><p>No HTML file was found in this presentation folder.</p><p><a href="${backHref}">Back</a></p></div></div></body></html>`;
  }
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta http-equiv="refresh" content="0; url=${targetRel}"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(title)}</title><script>location.replace(${JSON.stringify(targetRel)});</` + `script></head><body>${navHtml}</body></html>`;
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

function ensureStateShape(state) {
  if (!state || typeof state !== 'object') {
    state = { version: 'v1', updated: '', categories: {} };
  }
  if (!state.categories) state.categories = {};
  for (const [id, meta] of Object.entries(CAT_META)) {
    if (!state.categories[id]) state.categories[id] = { slots: meta.slots, titles: [], links: [] };
  }
}

function escapeHtml(s=''){return s.replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function sha1(buf){ return crypto.createHash('sha1').update(buf).digest('hex'); }
function ensureArraySize(arr,n){ while(arr.length<n) arr.push(''); }

function json(status, data) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
}

// Netlify Function: Incremental Deploy with batch "merge" support + diagnostics + in-function auth
// Required env: NETLIFY_TOKEN, PUBLIC_SITE_URL, (SITE_ID is auto-provided by Netlify)
// Optional env: ADMIN_KEY (if set, requests must include header x-admin-key: <value>)
const crypto = require('crypto');

const CAT_META = {
  toolkit: { slots: 8,  baseOut: 'language-arts/toolkit/presentations', section: 'language-arts', back: '/language-arts/toolkit/index.html' },
  adit:    { slots: 16, baseOut: 'presentations/a-door-into-time',      section: 'language-arts', back: '/language-arts/a-door-into-time/index.html' },
  lik:     { slots: 16, baseOut: 'presentations/lost-in-kragdon-ah',     section: 'language-arts', back: '/language-arts/lost-in-kragdon-ah/index.html' },
  rfk:     { slots: 16, baseOut: 'presentations/return-from-kragdon-ah', section: 'language-arts', back: '/language-arts/return-from-kragdon-ah/index.html' },
  wok:     { slots: 16, baseOut: 'presentations/warrior-of-kragdon-ah',  section: 'language-arts', back: '/language-arts/warrior-of-kragdon-ah/index.html' },
  life:    { slots: 32, baseOut: 'life-skills/presentations',            section: 'life-skills',   back: '/life-skills/index.html' }
};

const API = 'https://api.netlify.com/api/v1';

exports.handler = async (event) => {
  try {
    // Diagnostics endpoint (GET) to verify envs are visible at runtime
    if (event.httpMethod === 'GET') {
      return json(200, {
        ok: true,
        method: 'GET',
        hasToken: !!process.env.NETLIFY_TOKEN,
        hasSiteId: !!getSiteId(),
        hasPublicSiteUrl: !!process.env.PUBLIC_SITE_URL
      });
    }

    if (event.httpMethod !== 'POST') return json(405, { message: 'Method not allowed' });

    // Optional in-function auth
    const requiredKey = process.env.ADMIN_KEY;
    if (requiredKey) {
      const hdrs = event.headers || {};
      const sentKey = hdrs['x-admin-key'] || hdrs['X-Admin-Key'] || hdrs['x-Admin-Key'];
      if (!sentKey || sentKey !== requiredKey) {
        return json(401, { message: 'Unauthorized (invalid admin key)' });
      }
    }

    const body = JSON.parse(event.body || '{}');
    const { category, slot, title, files, merge } = body;

    if (!CAT_META[category]) return json(400, { message: 'Unknown category' });
    const cat = CAT_META[category];
    if (!slot || slot < 1 || slot > cat.slots) return json(400, { message: 'Invalid slot' });
    if (!title || !Array.isArray(files) || files.length === 0) return json(400, { message: 'Missing title/files' });

    const missing = [];
    const token = process.env.NETLIFY_TOKEN; if (!token) missing.push('NETLIFY_TOKEN');
    const siteId = getSiteId();              if (!siteId) missing.push('SITE_ID');
    if (missing.length) return json(500, { message: `Server not configured: missing ${missing.join(', ')}` });

    // 1) Latest deploy
    const deploy = await apiGET(`${API}/sites/${siteId}/deploys?per_page=1`, token).then(a => a[0]);
    if (!deploy) return json(500, { message: 'No existing deploy found' });

    // 2) Previous files map
    const prevFiles = await listDeployFiles(deploy.id, token);

    // 3) Build new file blobs for this batch
    const slotDir = `${cat.baseOut}/presentation-${String(slot).padStart(2,'0')}`;
    const newBlobs = new Map(); // /path -> Buffer
    const newShas  = new Map(); // /path -> sha1

    for (const f of files) {
      if (!f.path || !f.base64) continue;
      const buf = Buffer.from(f.base64, 'base64');
      const sha = sha1(buf);
      let path = (f.path || '').replace(/^\/+/, '');
      if (!path.startsWith('assets/images/')) path = `${slotDir}/${path}`;
      const full = '/' + path;
      newBlobs.set(full, buf);
      newShas.set(full, sha);
    }

    // 4) Choose entry HTML among provided files in this (or previous) batches
    let entryRel = null;
    const currentHtmls = Array.from(newBlobs.keys()).filter(p => p.startsWith('/' + slotDir + '/') && p.toLowerCase().endsWith('.html'));
    if (currentHtmls.length) {
      currentHtmls.sort((a,b) => {
        const aIdx = /\/index\.html?$/i.test(a) ? -1 : 0;
        const bIdx = /\/index\.html?$/i.test(b) ? -1 : 0;
        if (aIdx !== bIdx) return aIdx - bIdx;
        return a.length - b.length;
      });
      entryRel = currentHtmls[0].replace('/' + slotDir + '/', '');
    } else {
      const prevHtmls = Array.from(prevFiles.keys()).filter(p => p.startsWith('/' + slotDir + '/') && p.toLowerCase().endsWith('.html'));
      if (prevHtmls.length) {
        prevHtmls.sort((a,b) => {
          const aIdx = /\/index\.html?$/i.test(a) ? -1 : 0;
          const bIdx = /\/index\.html?$/i.test(b) ? -1 : 0;
          if (aIdx !== bIdx) return aIdx - bIdx;
          return a.length - b.length;
        });
        entryRel = prevHtmls[0].replace('/' + slotDir + '/', '');
      }
    }

    // 5) Generate redirect index.html and add to batch
    const redirectHtml = redirectIndexHtml(title, entryRel, cat.back, cat.section);
    const redirectPath = '/' + slotDir + '/index.html';
    const redirectBuf  = Buffer.from(redirectHtml);
    newBlobs.set(redirectPath, redirectBuf);
    newShas.set(redirectPath, sha1(redirectBuf));

    // 6) Update site state and category index
    let state = await fetchState();
    if (!state.categories) {
      state = {
        version: 'v1',
        updated: '',
        categories: Object.fromEntries(Object.entries(CAT_META).map(([id, m]) => [id, { slots: m.slots, titles: [], links: [] }]))
      };
    }
    ensureArraySize(state.categories[category].titles, cat.slots);
    ensureArraySize(state.categories[category].links,  cat.slots);
    state.categories[category].titles[slot - 1] = title;
    state.categories[category].links[slot - 1]  = `/${slotDir}/`;
    state.updated = new Date().toISOString();

    const statePath = '/assets/data/site-state.json';
    const stateBuf  = Buffer.from(JSON.stringify(state, null, 2));
    newBlobs.set(statePath, stateBuf);
    newShas.set(statePath, sha1(stateBuf));

    const catIndexPath = category === 'toolkit'
      ? '/language-arts/toolkit/index.html'
      : category === 'life'
        ? '/life-skills/index.html'
        : {
            adit: '/language-arts/a-door-into-time/index.html',
            lik:  '/language-arts/lost-in-kragdon-ah/index.html',
            rfk:  '/language-arts/return-from-kragdon-ah/index.html',
            wok:  '/language-arts/warrior-of-kragdon-ah/index.html'
          }[category];
    if (catIndexPath) {
      const catHtml = generateCategoryIndex(category, state);
      const catBuf  = Buffer.from(catHtml);
      newBlobs.set(catIndexPath, catBuf);
      newShas.set(catIndexPath, sha1(catBuf));
    }

    // 7) Merge previous manifest with this batch
    const filesMap = new Map(prevFiles); // path -> sha
    if (merge !== true) {
      for (const p of Array.from(filesMap.keys())) {
        if (p.startsWith('/' + slotDir + '/')) filesMap.delete(p);
      }
    }
    for (const [p, sha] of newShas.entries()) filesMap.set(p, sha);

    // 8) Create deploy referencing complete manifest so far
    const deployRes = await apiPOST(`${API}/sites/${siteId}/deploys`, token, {
      files: Object.fromEntries(filesMap.entries()),
      draft: false
    });

    // 9) Upload only required files for this deploy
    const required = deployRes?.required || [];
    for (const p of required) {
      const buf = newBlobs.get(p);
      if (!buf) continue;
      await rawPUT(`${API}/deploys/${deployRes.id}/files${p}`, token, buf);
    }

    return json(200, {
      ok: true,
      deploy_id: deployRes.id,
      deploy_url: deployRes.deploy_ssl_url || deployRes.ssl_url || deployRes.deploy_url || null
    });

  } catch (e) {
    return json(500, { message: e?.message || 'Server error' });
  }
};

// ----- helpers -----
function getSiteId(){
  return process.env.SITE_ID || process.env.NETLIFY_SITE_ID || process.env.site_id || null;
}

function redirectIndexHtml(title, targetRel, backHref, section) {
  const getSectionReturn = (section) => {
    if (section === 'language-arts' || section === 'toolkit') return '/language-arts/index.html';
    if (section === 'life-skills') return '/life-skills/index.html';
    return '/';
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

function escapeHtml(s=''){return s.replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function sha1(buf){ return crypto.createHash('sha1').update(buf).digest('hex'); }
function ensureArraySize(arr,n){ while(arr.length<n) arr.push(''); }

async function apiGET(url, token){
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }});
  if (!res.ok) throw new Error(`GET ${url} ${res.status}`);
  return res.json();
}
async function apiPOST(url, token, body){
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`POST ${url} ${res.status} ${await res.text()}`);
  return res.json();
}
async function rawPUT(url, token, buf){
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
    body: buf
  });
  if (!res.ok) throw new Error(`PUT ${url} ${res.status} ${await res.text()}`);
}
async function listDeployFiles(deployId, token){
  let page=1; const result=new Map();
  while(true){
    const res = await apiGET(`${API}/deploys/${deployId}/files?per_page=10000&page=${page}`, token);
    if(!Array.isArray(res) || res.length===0) break;
    for(const f of res){
      if (f?.path && f?.sha){
        result.set(f.path.startsWith('/') ? f.path : '/' + f.path, f.sha);
      }
    }
    if(res.length<10000) break;
    page++;
  }
  return result;
}
async function fetchState(){
  const base = process.env.PUBLIC_SITE_URL;
  if (!base) return {};
  try {
    const res = await fetch(`${base}/assets/data/site-state.json`, { headers: { 'Cache-Control': 'no-cache' } });
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}
function json(status, data){
  return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
}

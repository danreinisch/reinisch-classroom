// Incremental Deploy (GitHub commits) + diagnostics + backfill + publisher migration
// Auth: Allows if EITHER a valid admin session cookie is present OR the legacy ADMIN_KEY matches.
// If ADMIN_KEY is not set, only session-based auth works.
//
// Required envs:
// - GITHUB_TOKEN, GH_REPO, (optional GH_BRANCH), PUBLIC_SITE_URL
// - ADMIN_SESSION_SECRET (same as the login function)
//
// Optional:
// - ADMIN_KEY (legacy; if present, requests may also send x-admin-key header)

const crypto = require('crypto');

const GH_API = 'https://api.github.com';
const SESSION_COOKIE_NAMES = ['rc_admin_session_v2', 'rc_admin_session'];

exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const action = qs.action || '';

    // Diagnostics/maintenance (GET)
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
      if (action === 'backfill') { await requireAdmin(event); return await handleBackfill(); }
      if (action === 'migrate_publisher') { await requireAdmin(event); return await handleMigratePublisher(); }
      return json(200, { ok: true, message: 'Use POST to upload; GET ?action=diagnostics|backfill|migrate_publisher' });
    }

    // Upload (POST)
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

    // Add files
    for (const f of files) {
      if (!f.path || !f.base64) continue;
      const buf = Buffer.from(f.base64, 'base64');
      let outPath = (f.path || '').replace(/^\/+/, '');
      if (outPath.startsWith('assets/images/')) outPath = `site/${outPath}`;
      else outPath = `${slotDir}/${outPath}`;
      blobs.set(outPath, buf);
    }

    // Entry + redirect
    const entryRel = await pickEntryHtml(owner, repo, branch, blobs, slotDir);
    const redirectHtml = redirectIndexHtml(title, entryRel, cat.back, cat.section);
    blobs.set(`${slotDir}/index.html`, Buffer.from(redirectHtml));

    // Update site-state + category index
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

    const message = final ? `Upload ${category} #${slot} (final batch)` : `Upload ${category} #${slot} (batch, merge=${!!merge})`;

    const commitSha = await commitTreeWithRetry(owner, repo, branch, blobs, message);
    return json(200, { ok: true, commit: commitSha, deploy_url: process.env.PUBLIC_SITE_URL || null, final: !!final });
  } catch (e) {
    console.error('Top-level error:', e && e.stack ? e.stack : e);
    const msg = e?.message ? String(e.message) : '';
    const status = e?.status || e?.statusCode || (msg.toLowerCase().startsWith('unauthorized') ? 401 : 500);
    return json(status, { message: shortErr(e) });
  }
};

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
    const names = ['rc_admin_session_v2','rc_admin_session'];
    let token = '';
    for (const n of names) {
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

    const expected = require('crypto').createHmac('sha256', secret).update(payloadBuf).digest();
    const actual = b64urlDecode(sigB64);
    if (expected.length !== actual.length) return false;
    return require('crypto').timingSafeEqual(expected, actual);
  } catch { return false; }
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
  const pad = str.length % 4; if (pad) str += '='.repeat(4 - pad);
  return Buffer.from(str, 'base64');
}

// ---------- GitHub helpers + existing code (unchanged) ----------
/* ... keep the rest of your existing helpers (parseRepo, getBranch, commitTree*, gh* helpers,
   fetchStateFromLiveOrRepo, categoryIndexPath, redirectIndexHtml, pickEntryHtml*, ensure*, json) ... */

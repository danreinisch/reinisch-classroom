'use strict';

/**
 * RC-MEDIA-01 — Large classroom media upload authorization.
 *
 * The existing Admin Uploader intentionally sends small presentation bundles
 * through Netlify/GitHub. Large media must not use that transport.
 *
 * This endpoint:
 * - requires the existing HttpOnly Teacher Center session
 * - requires the real admin role
 * - accepts only the dedicated public classroom-media bucket
 * - accepts only MP4 and WebVTT objects
 * - caps each object at 1 GiB
 * - creates a short-lived Supabase signed upload token with the service role
 * - returns the signed token and direct TUS endpoint, never the service role key
 *
 * POST /.netlify/functions/admin-media-upload-token
 */

const { requireTeacher } = require('./_lib/auth');
const { getSupabaseConfig } = require('./_lib/supa');

const { SESSION_SECRET } = process.env;

const MEDIA_BUCKET = 'classroom-media';
const MAX_FILE_BYTES = 1024 * 1024 * 1024;
const CACHE_CONTROL_SECONDS = '86400';

const ALLOWED_TYPES = Object.freeze({
  'video/mp4': '.mp4',
  'text/vtt': '.vtt',
});

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
    body: JSON.stringify(body),
  };
}

function cleanObjectPath(value) {
  const path = String(value || '').trim();

  if (!path || path.length > 240) return '';
  if (path.startsWith('/') || path.endsWith('/')) return '';
  if (path.includes('..') || path.includes('\\')) return '';
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(path)) return '';

  const segments = path.split('/');
  if (segments.some((part) => !part || part === '.' || part === '..')) return '';

  return path;
}

function encodedObjectPath(path) {
  return path
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function projectRefFromUrl(url) {
  try {
    return new URL(url).hostname.split('.')[0] || '';
  } catch {
    return '';
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        Allow: 'POST, OPTIONS',
        'Cache-Control': 'no-store',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Method Not Allowed' });
  }

  if (!SESSION_SECRET) {
    return json(503, { ok: false, error: 'Admin session unavailable' });
  }

  const auth = requireTeacher(event, SESSION_SECRET);

  if (!auth.ok) {
    return json(401, { ok: false, error: 'Unauthorized' });
  }

  if (!auth.user || auth.user.role !== 'admin') {
    return json(403, { ok: false, error: 'Admin access required' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { ok: false, error: 'Invalid JSON body' });
  }

  const objectPath = cleanObjectPath(body.objectPath);
  const contentType = String(body.contentType || '').trim().toLowerCase();
  const size = Number(body.size);

  if (!objectPath) {
    return json(400, { ok: false, error: 'Invalid media object path' });
  }

  const requiredExtension = ALLOWED_TYPES[contentType];

  if (!requiredExtension || !objectPath.toLowerCase().endsWith(requiredExtension)) {
    return json(400, { ok: false, error: 'Unsupported media type or extension' });
  }

  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_FILE_BYTES) {
    return json(400, {
      ok: false,
      error: 'Media file must be between 1 byte and 1 GiB',
    });
  }

  const { url: supabaseUrl, key: serviceRoleKey } = getSupabaseConfig();
  const projectRef = projectRefFromUrl(supabaseUrl);

  if (!supabaseUrl || !serviceRoleKey || !projectRef) {
    return json(503, { ok: false, error: 'Media storage unavailable' });
  }

  const encodedPath = encodedObjectPath(objectPath);
  const signUrl =
    `${supabaseUrl}/storage/v1/object/upload/sign/` +
    `${encodeURIComponent(MEDIA_BUCKET)}/${encodedPath}`;

  let response;

  try {
    response = await fetch(signUrl, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        'x-upsert': 'false',
      },
      body: '{}',
    });
  } catch (error) {
    console.error('[admin-media-upload-token] Storage request failed:', error.message);
    return json(502, { ok: false, error: 'Could not authorize media upload' });
  }

  const text = await response.text();
  let data = null;

  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }

  if (!response.ok || !data || !data.url) {
    console.error(
      '[admin-media-upload-token] Storage signing failed:',
      response.status,
      text.slice(0, 300)
    );

    return json(response.status >= 400 && response.status < 500 ? 409 : 502, {
      ok: false,
      error: 'Could not create signed media upload URL',
    });
  }

  let token = '';

  try {
    const signedUrl = new URL(`${supabaseUrl}/storage/v1${data.url}`);
    token = signedUrl.searchParams.get('token') || '';
  } catch {
    token = '';
  }

  if (!token) {
    return json(502, { ok: false, error: 'Storage did not return an upload token' });
  }

  const publicUrl =
    `${supabaseUrl}/storage/v1/object/public/` +
    `${encodeURIComponent(MEDIA_BUCKET)}/${encodedPath}`;

  return json(200, {
    ok: true,
    bucket: MEDIA_BUCKET,
    objectPath,
    contentType,
    size,
    token,
    cacheControl: CACHE_CONTROL_SECONDS,
    uploadEndpoint:
      `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`,
    publicUrl,
    expiresInSeconds: 7200,
  });
};

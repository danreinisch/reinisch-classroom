// Fetch polyfill for Netlify Functions
// Ensures global.fetch is available for Supabase client operations
// This is a defensive fallback for runtimes that don't provide fetch natively

if (typeof global.fetch === 'undefined') {
  console.warn('[fetch-polyfill] Global fetch not found, loading node-fetch polyfill');
  try {
    const nodeFetch = require('node-fetch');
    global.fetch = nodeFetch;
    global.Headers = nodeFetch.Headers;
    global.Request = nodeFetch.Request;
    global.Response = nodeFetch.Response;
  } catch (err) {
    console.error('[fetch-polyfill] Failed to load node-fetch:', err.message);
    throw new Error('fetch polyfill failed to load - ensure node-fetch is installed');
  }
} else {
  // fetch is already available (Node 18+)
  console.log('[fetch-polyfill] Global fetch already available');
}

module.exports = {};

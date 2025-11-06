// Vendored fallback for @supabase/supabase-js@2
// This is a placeholder stub for the full Supabase JS library
// 
// IMPORTANT: In production, replace this file with the actual Supabase JS library ESM build
// Download from: https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm
// or build from: https://github.com/supabase/supabase-js
//
// The actual library is ~200KB minified and provides full Supabase functionality.
// This stub allows the application to run in environments where CDN access is blocked,
// but will fall back to localStorage-only mode.

console.warn('[vendor/supabase-js@2.mjs] Using stub - Supabase features unavailable. Replace with actual library for production.');

// Minimal stub to prevent import errors
export function createClient(url, key, options) {
  console.warn('Supabase createClient called on stub - returning null client');
  return null;
}

// Note: In production, this file should be replaced with the actual @supabase/supabase-js@2 ESM bundle
// which exports createClient and other Supabase functionality.

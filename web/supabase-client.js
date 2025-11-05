// Minimal client. If no env keys are provided, this module logs a warning and does nothing.
// Downstream code should feature-detect and fall back to localStorage when supabase is null.

let createClient = null;
let supabaseLoadError = null;

// Try to import Supabase, but don't fail if CDN is blocked
try {
  const module = await import('https://esm.sh/@supabase/supabase-js@2');
  createClient = module.createClient;
} catch (err) {
  console.warn('Supabase CDN blocked or unavailable; app will use localStorage backend.', err.message);
  supabaseLoadError = err.message;
}

// Read config from localStorage using unified keys with legacy fallback
const UNIFIED_PREFIX = 'rc_unified_';
const LEGACY_PREFIX = 'rc_';

function getStoredValue(unifiedKey, legacyKeys = []) {
  // Try unified key first
  let value = localStorage.getItem(UNIFIED_PREFIX + unifiedKey);
  if (value) return value;
  
  // Try legacy keys as fallback
  for (const legacyKey of legacyKeys) {
    value = localStorage.getItem(LEGACY_PREFIX + legacyKey);
    if (value) return value;
  }
  
  return null;
}

const storedUrl = getStoredValue('supabase_url', ['supabase_url']);
const storedKey = getStoredValue('supabase_anon', ['supabase_key', 'supabase_anon']);
const useRemote = getStoredValue('use_supabase', ['use_remote', 'use_supabase']) === 'true';

// Initialize Supabase client only when both URL and key exist AND use_remote is true AND createClient loaded
const url = window.SUPABASE_URL || storedUrl;
const key = window.SUPABASE_ANON_KEY || storedKey;

export const supabase = (createClient && url && key && useRemote)
  ? createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true }
    })
  : null;

if (!supabase) {
  if (supabaseLoadError) {
    console.warn('Supabase library not available:', supabaseLoadError);
  } else {
    console.warn('Supabase env not detected; app will use localStorage backend.');
  }
}

// Helper to test connection
export async function testConnection() {
  if (!supabase) {
    return { ok: false, error: 'not-configured' };
  }
  
  try {
    // Attempt a cheap query to test connection
    // Using a simple select that should work on any Supabase project
    const { error } = await supabase.from('students').select('id', { count: 'exact', head: true });
    if (error) {
      // If students table doesn't exist, that's also useful info
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || 'connection-failed' };
  }
}
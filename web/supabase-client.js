// Minimal client. If no env keys are provided, this module logs a warning and does nothing.
// Downstream code should feature-detect and fall back to localStorage when supabase is null.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Read config from localStorage
const NS = 'rc_unified_';
const storedUrl = localStorage.getItem(NS + 'supabase_url');
const storedKey = localStorage.getItem(NS + 'supabase_key');
const useRemote = localStorage.getItem(NS + 'use_remote') === 'true';

// Initialize Supabase client only when both URL and key exist AND use_remote is true
const url = window.SUPABASE_URL || storedUrl;
const key = window.SUPABASE_ANON_KEY || storedKey;

export const supabase = (url && key && useRemote)
  ? createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true }
    })
  : null;

if (!supabase) {
  console.warn('Supabase env not detected; app will use localStorage backend.');
}

// Helper to test connection
export async function testConnection() {
  if (!supabase) {
    return { ok: false, error: 'not-configured' };
  }
  
  try {
    // Attempt a cheap query to test connection
    const { error } = await supabase.from('students').select('id').limit(1);
    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || 'connection-failed' };
  }
}
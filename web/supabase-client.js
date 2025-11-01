// Minimal client. If no env keys are provided, this module logs a warning and does nothing.
// Downstream code should feature-detect and fall back to localStorage when supabase is null.

// Read config from localStorage
const NS = 'rc_unified_';
const storedUrl = localStorage.getItem(NS + 'supabase_url');
const storedKey = localStorage.getItem(NS + 'supabase_key');
const useRemote = localStorage.getItem(NS + 'use_remote') === 'true';

// Initialize Supabase client only when both URL and key exist AND use_remote is true
const url = window.SUPABASE_URL || storedUrl;
const key = window.SUPABASE_ANON_KEY || storedKey;

let supabase = null;

// Lazy-load Supabase client only when configured, so a blocked CDN import doesn't break the entire app on first load
(async () => {
  if (url && key && useRemote) {
    try {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      supabase = createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true }
      });
    } catch (err) {
      console.warn('Failed to load Supabase client from CDN:', err.message);
      supabase = null;
    }
  }

  if (!supabase) {
    console.warn('Supabase env not detected; app will use localStorage backend.');
  }
})();

export { supabase };

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
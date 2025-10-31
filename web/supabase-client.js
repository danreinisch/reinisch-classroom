// Minimal client. If no env keys are provided, this module logs a warning and does nothing.
// Downstream code should feature-detect and fall back to localStorage when supabase is null.

let supabase = null;

// Only try to import Supabase if credentials are present
if (window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
  } catch (error) {
    console.warn('Failed to load Supabase module:', error.message);
    supabase = null;
  }
}

if (!supabase) {
  console.warn('Supabase env not detected; app will use localStorage backend.');
}

export { supabase };
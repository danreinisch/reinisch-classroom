// Minimal client. If no env keys are provided, this module logs a warning and does nothing.
// Downstream code should feature-detect and fall back to localStorage when supabase is null.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const supabase = (window.SUPABASE_URL && window.SUPABASE_ANON_KEY)
  ? createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true }
    })
  : null;

if (!supabase) {
  console.warn('Supabase env not detected; app will use localStorage backend.');
}
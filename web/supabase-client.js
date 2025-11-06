// Re-export reactive Supabase client from site/web/supabase-client.js
// This keeps a single implementation in site/web/ and makes it available from web/
export { supabase, getSupabase, resetSupabaseClient, testConnection } from '../site/web/supabase-client.js';
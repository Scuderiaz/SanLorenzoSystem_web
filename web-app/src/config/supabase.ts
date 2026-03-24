import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || '';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || '';

let supabase: SupabaseClient | null = null;
let isSupabaseConfigured = false;

if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
  isSupabaseConfigured = true;
  // Helpful runtime log for debugging environment issues
  console.info('[supabase] configured with URL:', supabaseUrl);
} else {
  console.warn('[supabase] REACT_APP_SUPABASE_URL or REACT_APP_SUPABASE_ANON_KEY is missing. Supabase client not initialized.');
}

export { supabase, isSupabaseConfigured };

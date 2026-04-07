import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || '';
const supabasePublishableKey =
  process.env.REACT_APP_SUPABASE_PUBLISHABLE_KEY ||
  process.env.REACT_APP_SUPABASE_ANON_KEY ||
  '';
const supabaseSchema = process.env.REACT_APP_SUPABASE_SCHEMA || 'water_billing';

let supabase: SupabaseClient | null = null;
let isSupabaseConfigured = false;

if (supabaseUrl && supabasePublishableKey) {
  supabase = createClient(supabaseUrl, supabasePublishableKey, {
    db: { schema: supabaseSchema },
  });
  isSupabaseConfigured = true;
  // Helpful runtime log for debugging environment issues
  console.info('[supabase] configured with URL:', supabaseUrl, 'schema:', supabaseSchema);
} else {
  console.warn('[supabase] REACT_APP_SUPABASE_URL or REACT_APP_SUPABASE_PUBLISHABLE_KEY is missing. Supabase client not initialized.');
}

export { supabase, isSupabaseConfigured };

import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

const missing = !url || !key

if (missing) {
  console.error(
    'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (local: .env.local, CI: GitHub Secrets).'
  )
}

/**
 * Browser client uses the public anon key only.
 * All financial data is protected by Supabase Row Level Security — unauthenticated
 * requests and other users cannot read or write your rows.
 * Never use the service_role key here.
 */
export const supabase = createClient(url ?? '', key ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

export const isSupabaseConfigured = !missing

export const allowSignup =
  import.meta.env.VITE_ALLOW_SIGNUP === 'true' || import.meta.env.DEV

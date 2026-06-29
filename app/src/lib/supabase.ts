import { createClient } from '@supabase/supabase-js'

const url =
  import.meta.env.VITE_SUPABASE_URL ??
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL
const key =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

const missing = !url || !key

if (missing) {
  console.error(
    'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).'
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

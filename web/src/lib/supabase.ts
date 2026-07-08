import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** True when both env vars are present — the UI shows a setup hint otherwise. */
export const isSupabaseConfigured = Boolean(url && anonKey)

if (!isSupabaseConfigured) {
  // Non-fatal: the app renders a "connect Supabase" screen instead of crashing.
  console.warn(
    '[Workana Radar] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. ' +
      'Set them in .env (local) or Vercel → Settings → Environment Variables.',
  )
}

// Fall back to harmless placeholders so createClient never throws at import time.
export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    realtime: { params: { eventsPerSecond: 5 } },
  },
)

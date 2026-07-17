import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loadEnvFiles } from './loadEnv.ts'

let client: SupabaseClient | null = null

export function initSupabaseAdmin(): SupabaseClient {
  if (client) return client

  loadEnvFiles()

  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      'Supabase Admin nicht konfiguriert.\n\n' +
        'In .env setzen:\n' +
        '  VITE_SUPABASE_URL=https://xxxx.supabase.co\n' +
        '  SUPABASE_SERVICE_ROLE_KEY=eyJ...\n\n' +
        'Schema einmalig ausführen: supabase/schema.sql (SQL Editor)'
    )
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return client
}

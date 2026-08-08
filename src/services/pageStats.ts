import { getSupabase, isSupabaseConfigured } from '../supabase'
import { pagePathBucket } from '../utils/pagePathBucket'

const SESSION_KEY = 'ultraplaner-session-stat'

/** One anonymous session hit per browser tab session — no analytics cookies. */
export function recordSessionPageView(path: string): void {
  if (import.meta.env.DEV) return
  if (!isSupabaseConfigured()) return

  try {
    if (sessionStorage.getItem(SESSION_KEY)) return
    sessionStorage.setItem(SESSION_KEY, '1')
  } catch {
    return
  }

  const bucket = pagePathBucket(path)
  void getSupabase()
    .rpc('record_page_session', { p_path_bucket: bucket })
    .then(({ error }) => {
      if (error) console.warn('[pageStats]', error.message)
    })
}

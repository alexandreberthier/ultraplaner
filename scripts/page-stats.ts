/**
 * Print anonymous session counts from Supabase (service role).
 * Usage: npm run page-stats
 */
import { initSupabaseAdmin } from './supabaseAdmin.ts'

const sb = initSupabaseAdmin()

const { data, error } = await sb
  .from('page_stats_daily')
  .select('day, sessions, paths')
  .order('day', { ascending: false })
  .limit(30)

if (error) {
  if (error.message.includes('page_stats_daily')) {
    console.error('Tabelle fehlt — bitte supabase/page_stats.sql im SQL Editor ausführen.')
  } else {
    console.error(error.message)
  }
  process.exit(1)
}

if (!data?.length) {
  console.log('Noch keine Session-Zähler (Tabelle leer).')
  process.exit(0)
}

let total = 0
console.log('UltraPlaner — anonyme Sessions (letzte 30 Tage)\n')
for (const row of data) {
  total += row.sessions ?? 0
  const paths = row.paths && typeof row.paths === 'object' ? row.paths : {}
  const pathStr = Object.entries(paths as Record<string, number>)
    .map(([k, v]) => `${k}:${v}`)
    .join(', ')
  console.log(`${row.day}  ${String(row.sessions).padStart(5)} sessions  ${pathStr}`)
}
console.log(`\nSumme (30 Tage): ${total} sessions`)

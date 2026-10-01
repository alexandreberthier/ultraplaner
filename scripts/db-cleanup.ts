/**
 * Free Supabase storage: expired maps/exports, slim share payloads, legacy import rows.
 *
 * Usage: npm run db:cleanup
 * Requires: VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *
 * After large deletes, reclaim disk in Supabase SQL Editor (see supabase/cleanup.sql).
 */
import { initSupabaseAdmin } from './supabaseAdmin.ts'

type MapPayload = {
  pois?: { id: string }[]
  favorites?: string[]
  poisCloud?: string
  [key: string]: unknown
}

const sb = initSupabaseAdmin()
const ID_PAGE = 40

async function cleanupExpired(): Promise<{ maps: number; exports: number }> {
  let maps = 0
  let exports = 0

  const mapsRpc = await sb.rpc('cleanup_expired_maps')
  if (mapsRpc.error) {
    console.warn(`cleanup_expired_maps: ${mapsRpc.error.message}`)
  } else {
    maps = typeof mapsRpc.data === 'number' ? mapsRpc.data : 0
  }

  const exportsRpc = await sb.rpc('cleanup_expired_route_exports')
  if (exportsRpc.error) {
    console.warn(`cleanup_expired_route_exports: ${exportsRpc.error.message}`)
  } else {
    exports = typeof exportsRpc.data === 'number' ? exportsRpc.data : 0
  }

  return { maps, exports }
}

/** Drop Overpass-era import_progress rows (keep pbf_* region markers). */
async function pruneLegacyImportProgress(): Promise<number> {
  const { data, error } = await sb.from('import_progress').select('id')
  if (error) {
    console.warn(`import_progress list: ${error.message}`)
    return 0
  }

  const toDelete = (data ?? [])
    .map((r) => r.id as string)
    .filter((id) => !id.startsWith('pbf_') && id !== 'import_meta')

  let deleted = 0
  const BATCH = 200
  for (let i = 0; i < toDelete.length; i += BATCH) {
    const chunk = toDelete.slice(i, i + BATCH)
    const { error: delErr, count } = await sb
      .from('import_progress')
      .delete({ count: 'exact' })
      .in('id', chunk)
    if (delErr) {
      console.warn(`import_progress delete: ${delErr.message}`)
      break
    }
    deleted += count ?? chunk.length
  }
  return deleted
}

/**
 * Rewrite fat share payloads to favorites-only (same as new client saves).
 * Loads ids in pages, then one payload at a time — avoids statement timeouts.
 */
async function slimMapPayloads(): Promise<{ scanned: number; slimmed: number; bytesSavedEst: number }> {
  let scanned = 0
  let slimmed = 0
  let bytesSavedEst = 0
  let afterId = ''

  for (;;) {
    let q = sb.from('maps').select('id').order('id', { ascending: true }).limit(ID_PAGE)
    if (afterId) q = q.gt('id', afterId)
    const { data: ids, error } = await q
    if (error) throw new Error(`maps id select: ${error.message}`)
    if (!ids?.length) break

    for (const { id } of ids) {
      afterId = id
      const { data, error: oneErr } = await sb
        .from('maps')
        .select('payload')
        .eq('id', id)
        .maybeSingle()
      if (oneErr) {
        console.warn(`maps ${id}: ${oneErr.message}`)
        continue
      }
      if (!data) continue

      scanned++
      const payload = (data.payload ?? {}) as MapPayload
      if (payload.poisCloud === 'favorites') continue

      const favorites = Array.isArray(payload.favorites) ? payload.favorites : []
      const pois = Array.isArray(payload.pois) ? payload.pois : []
      const favSet = new Set(favorites)
      const slimPois = pois.filter((p) => favSet.has(p.id))

      const before = JSON.stringify(payload).length
      const next = { ...payload, pois: slimPois, poisCloud: 'favorites' as const }
      const after = JSON.stringify(next).length
      const { error: upErr } = await sb.from('maps').update({ payload: next }).eq('id', id)
      if (upErr) {
        console.warn(`maps slim ${id}: ${upErr.message}`)
        continue
      }
      slimmed++
      bytesSavedEst += Math.max(0, before - after)
      if (pois.length !== slimPois.length) {
        console.log(
          `  slim ${id}: ${pois.length} → ${slimPois.length} POIs (−${Math.round((before - after) / 1024)} KB)`
        )
      }
    }

    if (ids.length < ID_PAGE) break
  }

  return { scanned, slimmed, bytesSavedEst }
}

async function main() {
  console.log('UltraPlaner DB cleanup\n')

  const expired = await cleanupExpired()
  console.log(`Expired deleted: maps=${expired.maps}, route_exports=${expired.exports}`)

  const legacy = await pruneLegacyImportProgress()
  console.log(`Legacy import_progress rows deleted: ${legacy}`)

  console.log('\nSlimming share map payloads…')
  const slim = await slimMapPayloads()
  console.log(
    `Maps scanned=${slim.scanned}, slimmed=${slim.slimmed}, ~${Math.round(slim.bytesSavedEst / 1024)} KB payload text freed`
  )

  console.log(`
Done. To reclaim Postgres disk space, run in Supabase SQL Editor:
  vacuum (analyze) maps;
  vacuum (analyze) route_exports;
  vacuum (analyze) import_progress;

Optional daily cron: see supabase/cleanup.sql
`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})

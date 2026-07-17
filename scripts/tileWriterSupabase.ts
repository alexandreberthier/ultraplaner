import type { SupabaseClient } from '@supabase/supabase-js'
import type { Poi } from '../shared/types.ts'
import ngeohash from 'ngeohash'

export const GEOHASH_PRECISION = 5
const UPSERT_BATCH = 200
const READ_CHUNK = 100

export function groupPoisByGeohash(pois: Poi[]): Map<string, Poi[]> {
  const groups = new Map<string, Poi[]>()
  for (const poi of pois) {
    const tileId = ngeohash.encode(poi.lat, poi.lng, GEOHASH_PRECISION)
    const list = groups.get(tileId) ?? []
    list.push(poi)
    groups.set(tileId, list)
  }
  return groups
}

export function dedupePois(pois: Poi[]): Poi[] {
  const seen = new Set<string>()
  const out: Poi[] = []
  for (const p of pois) {
    if (seen.has(p.id)) continue
    seen.add(p.id)
    out.push(p)
  }
  return out
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export async function findExistingGeohashes(
  sb: SupabaseClient,
  geohashIds: string[]
): Promise<Set<string>> {
  const existing = new Set<string>()
  for (let i = 0; i < geohashIds.length; i += READ_CHUNK) {
    const chunk = geohashIds.slice(i, i + READ_CHUNK)
    const { data, error } = await sb.from('tiles').select('geohash').in('geohash', chunk)
    if (error) throw new Error(`tiles select: ${error.message}`)
    for (const row of data ?? []) existing.add(row.geohash as string)
  }
  return existing
}

export async function readTilePois(sb: SupabaseClient, geohashId: string): Promise<Poi[]> {
  const { data, error } = await sb.from('tiles').select('pois').eq('geohash', geohashId).maybeSingle()
  if (error) throw new Error(`tile read ${geohashId}: ${error.message}`)
  return (data?.pois as Poi[]) ?? []
}

async function upsertTile(sb: SupabaseClient, geohashId: string, pois: Poi[]): Promise<void> {
  const unique = dedupePois(pois)
  const { error } = await sb.from('tiles').upsert(
    {
      geohash: geohashId,
      pois: unique,
      poi_count: unique.length,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'geohash' }
  )
  if (error) throw new Error(`tile upsert ${geohashId}: ${error.message}`)
}

/** Neue Kacheln in Batches upserten. */
export async function batchUpsertNewTiles(
  sb: SupabaseClient,
  entries: Array<{ geohashId: string; pois: Poi[] }>
): Promise<number> {
  let written = 0

  for (let i = 0; i < entries.length; i += UPSERT_BATCH) {
    const slice = entries.slice(i, i + UPSERT_BATCH)
    const rows = slice.map(({ geohashId, pois }) => {
      const unique = dedupePois(pois)
      return {
        geohash: geohashId,
        pois: unique,
        poi_count: unique.length,
        updated_at: new Date().toISOString(),
      }
    })

    const { error } = await sb.from('tiles').upsert(rows, { onConflict: 'geohash' })
    if (error) throw new Error(`batch upsert @${i}: ${error.message}`)

    written += rows.length
    process.stdout.write(
      `\r[pbf] Upsert ${Math.min(i + UPSERT_BATCH, entries.length)}/${entries.length}`
    )
    await sleep(50)
  }

  if (entries.length) process.stdout.write('\n')
  return written
}

/** Bestehende Kachel mergen (lesen + dedupe + upsert). */
export async function mergePoisIntoTile(
  sb: SupabaseClient,
  geohashId: string,
  newPois: Poi[]
): Promise<void> {
  if (!newPois.length) return
  const existing = await readTilePois(sb, geohashId)
  await upsertTile(sb, geohashId, [...existing, ...newPois])
}

export async function writePoisToSupabase(sb: SupabaseClient, pois: Poi[]): Promise<void> {
  const groups = groupPoisByGeohash(pois)
  console.log(`[pbf] Schreibe ${pois.length} POIs in ${groups.size} Geohash-Kacheln (Supabase)…`)

  const existingIds = await findExistingGeohashes(sb, [...groups.keys()])
  const newEntries: Array<{ geohashId: string; pois: Poi[] }> = []
  const mergeEntries: Array<{ geohashId: string; pois: Poi[] }> = []

  for (const [geohashId, groupPois] of groups) {
    if (existingIds.has(geohashId)) mergeEntries.push({ geohashId, pois: groupPois })
    else newEntries.push({ geohashId, pois: groupPois })
  }

  console.log(`[pbf] neu=${newEntries.length}, merge=${mergeEntries.length}`)

  const CHUNK = 1000
  for (let i = 0; i < newEntries.length; i += CHUNK) {
    const slice = newEntries.slice(i, i + CHUNK)
    console.log(
      `[pbf] Batch-Häppchen ${i + 1}–${Math.min(i + CHUNK, newEntries.length)}/${newEntries.length}`
    )
    await batchUpsertNewTiles(sb, slice)
  }

  let done = 0
  for (const { geohashId, pois: groupPois } of mergeEntries) {
    await mergePoisIntoTile(sb, geohashId, groupPois)
    done++
    if (done % 50 === 0 || done === mergeEntries.length) {
      process.stdout.write(`\r[pbf] Merge ${done}/${mergeEntries.length}`)
    }
  }
  if (mergeEntries.length) process.stdout.write('\n')
}

export async function markRegionDone(
  sb: SupabaseClient,
  region: string,
  poiCount: number,
  tileIds: string[]
): Promise<void> {
  const rows = [
    ...tileIds.map((id) => ({
      id,
      region,
      poi_count: 0,
      source: 'geofabrik-pbf',
      imported_at: new Date().toISOString(),
    })),
    {
      id: `pbf_${region}`,
      region,
      poi_count: poiCount,
      source: 'geofabrik-pbf',
      imported_at: new Date().toISOString(),
    },
  ]

  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const slice = rows.slice(i, i + UPSERT_BATCH)
    const { error } = await sb.from('import_progress').upsert(slice, { onConflict: 'id' })
    if (error) throw new Error(`import_progress upsert: ${error.message}`)
  }
}

export async function isRegionDone(sb: SupabaseClient, region: string): Promise<boolean> {
  const { data, error } = await sb
    .from('import_progress')
    .select('id')
    .eq('id', `pbf_${region}`)
    .maybeSingle()
  if (error) throw new Error(`import_progress: ${error.message}`)
  return !!data
}

export async function countTiles(sb: SupabaseClient): Promise<number> {
  const { count, error } = await sb.from('tiles').select('*', { count: 'exact', head: true })
  if (error) throw new Error(`tiles count: ${error.message}`)
  return count ?? 0
}

export async function setImportMeta(
  sb: SupabaseClient,
  payload: Record<string, unknown>
): Promise<void> {
  const { error } = await sb.from('import_meta').upsert(
    {
      id: 'poiImport',
      payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  )
  if (error) throw new Error(`import_meta: ${error.message}`)
}

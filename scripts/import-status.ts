import { initSupabaseAdmin } from './supabaseAdmin.ts'
import { IMPORT_REGION_CODES } from '../shared/regions.ts'
import { dachImportTiles } from './dachTiles.ts'
import { countTiles } from './tileWriterSupabase.ts'

const sb = initSupabaseAdmin()

// Overpass-Kacheln (Legacy)
const allTiles = dachImportTiles()

// pbf_XX-Marker direkt abfragen (kein Full-Table-Scan nötig)
const { data: pbfRows, error: pbfErr } = await sb
  .from('import_progress')
  .select('id,poi_count')
  .like('id', 'pbf_%')
if (pbfErr) throw new Error(pbfErr.message)

const pbfDoneMap = new Map((pbfRows ?? []).map((r) => [r.id as string, r.poi_count as number]))
const pbfDone = IMPORT_REGION_CODES.filter((r) => pbfDoneMap.has(`pbf_${r}`))
const pbfMissing = IMPORT_REGION_CODES.filter((r) => !pbfDoneMap.has(`pbf_${r}`))

// Overpass-Kacheln: nur die für Legacy-Overpass-Regionen nötig
const { data: overpassRows, error: ovErr } = await sb
  .from('import_progress')
  .select('id')
  .not('id', 'like', 'pbf_%')
if (ovErr) throw new Error(ovErr.message)
const doneIds = new Set((overpassRows ?? []).map((d) => d.id as string))
const done = allTiles.filter((t) => doneIds.has(t.id))
const pending = allTiles.filter((t) => !doneIds.has(t.id))

const tileCount = await countTiles(sb)
const { data: meta } = await sb
  .from('import_meta')
  .select('payload')
  .eq('id', 'poiImport')
  .maybeSingle()

console.log(
  `Overpass-Kacheln (Markierungen): ${done.length}/${allTiles.length} fertig, ${pending.length} ausstehend`
)
console.log(
  `Geofabrik-PBF: ${pbfDone.length}/${IMPORT_REGION_CODES.length} fertig` +
    (pbfDone.length ? ` → ${pbfDone.join(', ')}` : '')
)
if (pbfMissing.length) console.log(`PBF fehlt noch: ${pbfMissing.join(', ')}`)
console.log(`Supabase tiles: ${tileCount ?? 'n/a (count fehlgeschlagen)'}`)

if (pbfDone.length) {
  console.log('\nPOIs je Region (aus import_progress):')
  for (const r of pbfDone) {
    const count = pbfDoneMap.get(`pbf_${r}`) ?? 0
    if (count > 0) console.log(`  ${r.padEnd(4)} ${count.toLocaleString('de')} POIs`)
  }
}

if (meta?.payload) console.log('\nmeta (letzte Session):', meta.payload)
if (pending.length) {
  console.log('Nächste Kacheln:', pending.slice(0, 5).map((t) => t.id).join(', '))
}

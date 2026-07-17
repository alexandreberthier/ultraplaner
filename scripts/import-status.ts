import { initSupabaseAdmin } from './supabaseAdmin.ts'
import { dachImportTiles } from './dachTiles.ts'
import { countTiles } from './tileWriterSupabase.ts'

const sb = initSupabaseAdmin()

const allTiles = dachImportTiles()
const { data: progressRows, error: progressErr } = await sb.from('import_progress').select('id')
if (progressErr) throw new Error(progressErr.message)

const doneIds = new Set((progressRows ?? []).map((d) => d.id as string))
const done = allTiles.filter((t) => doneIds.has(t.id))
const pending = allTiles.filter((t) => !doneIds.has(t.id))
const pbfRegions = ['AT', 'CH', 'LI', 'DE'].filter((r) => doneIds.has(`pbf_${r}`))

const tileCount = await countTiles(sb)
const { data: meta } = await sb.from('import_meta').select('payload').eq('id', 'poiImport').maybeSingle()

console.log(`Overpass-Kacheln (Markierungen): ${done.length}/${allTiles.length} fertig, ${pending.length} ausstehend`)
console.log(`Geofabrik-PBF Regionen: ${pbfRegions.length ? pbfRegions.join(', ') : 'noch keine'}`)
console.log(`Supabase tiles: ${tileCount}`)
if (meta?.payload) console.log('meta:', meta.payload)
if (pending.length) {
  console.log('Nächste Kacheln:', pending.slice(0, 5).map((t) => t.id).join(', '))
}

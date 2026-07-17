/**
 * Stichprobe: Österreich-POIs in Supabase prüfen.
 * Usage: npx tsx scripts/verify-austria.ts
 */
import ngeohash from 'ngeohash'
import { initSupabaseAdmin } from './supabaseAdmin.ts'
import { dachImportTiles } from './dachTiles.ts'

const sb = initSupabaseAdmin()

const samples: Array<[string, number, number]> = [
  ['Wien', 48.2082, 16.3738],
  ['Innsbruck', 47.2692, 11.4041],
  ['Graz', 47.0707, 15.4395],
  ['Salzburg', 47.8095, 13.055],
  ['Linz', 48.3069, 14.2858],
  ['Bregenz', 47.5031, 9.7471],
  ['Klagenfurt', 46.6247, 14.3053],
]

const { data: pbfAt } = await sb
  .from('import_progress')
  .select('poi_count')
  .eq('id', 'pbf_AT')
  .maybeSingle()

const atTiles = dachImportTiles('AT')
const { data: progressRows } = await sb
  .from('import_progress')
  .select('id')
  .in(
    'id',
    atTiles.map((t) => t.id)
  )
const marked = progressRows?.length ?? 0

console.log('── Österreich Import-Status (Supabase) ──')
console.log('pbf_AT:', pbfAt ? `${pbfAt.poi_count ?? '?'} POIs markiert` : 'FEHLT')
console.log(`AT-Kacheln in import_progress: ${marked}/${atTiles.length}`)
console.log('')
console.log('── Stichproben (Geohash-5) ──')

let ok = 0
for (const [name, lat, lng] of samples) {
  const id = ngeohash.encode(lat, lng, 5)
  const { data, error } = await sb.from('tiles').select('pois').eq('geohash', id).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) {
    console.log(`✗ ${name} (${id}): KEIN TILE`)
    continue
  }
  const pois = (data.pois as { category: string; name: string }[]) ?? []
  const cats = [...new Set(pois.map((p) => p.category))].sort().join(', ')
  console.log(`✓ ${name} (${id}): ${pois.length} POIs — ${cats}`)
  if (pois[0]) console.log(`    z.B. ${pois[0].name} (${pois[0].category})`)
  ok++
}

console.log('')
console.log(
  ok === samples.length
    ? `✓ Alle ${ok} Stichproben haben Daten — AT wirkt vollständig geladen.`
    : `⚠ ${ok}/${samples.length} Stichproben ok — bitte fehlende Orte prüfen.`
)

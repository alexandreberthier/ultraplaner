import { initAdminDb } from './firebaseAdmin.ts'
import ngeohash from 'ngeohash'

const db = initAdminDb()

// Wien Innenstadt — sollte in importiertem Gebiet liegen
const lat = 48.2082
const lng = 16.3738
const tileId = ngeohash.encode(lat, lng, 5)

console.log('Test-Geohash:', tileId)

const snap = await db.collection('tiles').doc(tileId).get()
if (!snap.exists) {
  console.log('Kein Tile-Dokument für Wien — nächstes vorhandenes Tile suchen…')
  const all = await db.collection('tiles').limit(3).get()
  for (const d of all.docs) {
    const data = d.data()
    console.log(`  ${d.id}: ${(data.pois as unknown[])?.length ?? 0} POIs`)
    if (data.pois?.[0]) console.log('  Beispiel:', JSON.stringify(data.pois[0]))
  }
} else {
  const data = snap.data()!
  const pois = data.pois as { id: string; name: string; category: string; lat: number; lng: number }[]
  console.log(`Tile ${tileId}: ${pois.length} POIs`)
  console.log('Kategorien:', [...new Set(pois.map((p) => p.category))].join(', '))
  console.log('Beispiele:', pois.slice(0, 3))
}

// Welche Geohash-5-Kacheln existieren rund um Wien?
const neighbors = Object.values(ngeohash.neighbors(tileId))
const ids = [tileId, ...neighbors]
let total = 0
for (const id of ids) {
  const s = await db.collection('tiles').doc(id).get()
  if (s.exists) {
    const n = (s.data()?.pois as unknown[])?.length ?? 0
    total += n
    console.log(`  ${id}: ${n} POIs`)
  }
}
console.log(`Nachbarn gesamt: ${total} POIs`)

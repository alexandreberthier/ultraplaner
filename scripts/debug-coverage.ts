import { initAdminDb } from './firebaseAdmin.ts'
import ngeohash from 'ngeohash'

const db = initAdminDb()

const snaps = await db.collection('tiles').select('pois').get()

let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180
let totalPois = 0

for (const doc of snaps.docs) {
  const pois = (doc.data().pois as { lat: number; lng: number }[]) ?? []
  totalPois += pois.length
  for (const p of pois) {
    if (p.lat < minLat) minLat = p.lat
    if (p.lat > maxLat) maxLat = p.lat
    if (p.lng < minLng) minLng = p.lng
    if (p.lng > maxLng) maxLng = p.lng
  }
}

console.log(`Tiles: ${snaps.size}, POIs: ${totalPois}`)
console.log(`Abgedeckte Bbox: lat ${minLat.toFixed(2)}–${maxLat.toFixed(2)}, lng ${minLng.toFixed(2)}–${maxLng.toFixed(2)}`)

// Test-Route in abgedecktem Gebiet (Graz-Nähe, lng ~15.4)
const testCoords: [number, number][] = [
  [15.40, 46.95],
  [15.42, 46.96],
  [15.44, 46.97],
]

const { tileIdsAlongRoute } = await import('../src/services/poiQuery.ts')
const ids = tileIdsAlongRoute(testCoords, 500)
let found = 0
for (const id of ids) {
  const s = await db.collection('tiles').doc(id).get()
  if (s.exists) {
    const n = (s.data()?.pois as unknown[])?.length ?? 0
    found += n
    if (n > 0) console.log(`  Tile ${id}: ${n} POIs`)
  }
}
console.log(`Test Graz-Route: ${ids.length} Geohash-Kacheln abgefragt, ${found} POIs in Firestore`)

// Wien
const wienIds = tileIdsAlongRoute([[16.37, 48.21], [16.38, 48.22]], 500)
let wienFound = 0
for (const id of wienIds) {
  const s = await db.collection('tiles').doc(id).get()
  if (s.exists) wienFound += (s.data()?.pois as unknown[])?.length ?? 0
}
console.log(`Test Wien-Route: ${wienFound} POIs in Firestore (erwartet: 0 — noch nicht importiert)`)

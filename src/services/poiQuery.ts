import ngeohash from 'ngeohash'
import { bboxFromCoords, sampleCoords } from './geo'

const GEOHASH_PRECISION = 5

/** ~5 km Kacheln entlang des Routen-Korridors (dedupliziert). */
export function tileIdsAlongRoute(
  coords: [number, number][],
  radiusM: number
): string[] {
  const bbox = bboxFromCoords(coords, radiusM + 2000)
  const sampled = sampleCoords(coords, 500)
  const ids = new Set<string>()

  for (const [lng, lat] of sampled) {
    ids.add(ngeohash.encode(lat, lng, GEOHASH_PRECISION))
    const neighbors = ngeohash.neighbors(ngeohash.encode(lat, lng, GEOHASH_PRECISION))
    for (const n of Object.values(neighbors)) {
      ids.add(n)
    }
  }

  const corners: [number, number][] = [
    [bbox.west, bbox.south],
    [bbox.east, bbox.south],
    [bbox.west, bbox.north],
    [bbox.east, bbox.north],
  ]
  for (const [lng, lat] of corners) {
    ids.add(ngeohash.encode(lat, lng, GEOHASH_PRECISION))
  }

  return [...ids]
}

export function encodeGeohash5(lat: number, lng: number): string {
  return ngeohash.encode(lat, lng, GEOHASH_PRECISION)
}

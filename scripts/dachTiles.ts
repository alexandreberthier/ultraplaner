import { IMPORT_REGIONS } from '../shared/regions.ts'

/** 1°-Import-Kacheln für unterstützte Regionen. */
export interface ImportTile {
  id: string
  region: string
  south: number
  west: number
  north: number
  east: number
}

export function dachImportTiles(regionFilter?: string): ImportTile[] {
  const tiles: ImportTile[] = []

  for (const region of IMPORT_REGIONS) {
    if (regionFilter && region.code !== regionFilter) continue

    for (let lat = Math.floor(region.south); lat < region.north; lat += 1) {
      for (let lng = Math.floor(region.west); lng < region.east; lng += 1) {
        const south = Math.max(lat, region.south)
        const west = Math.max(lng, region.west)
        const north = Math.min(lat + 1, region.north)
        const east = Math.min(lng + 1, region.east)
        if (north <= south || east <= west) continue

        tiles.push({
          id: `${region.code}_${lat}_${lng}`,
          region: region.code,
          south,
          west,
          north,
          east,
        })
      }
    }
  }

  return tiles
}

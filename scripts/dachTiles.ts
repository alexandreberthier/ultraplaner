/** 1°-Import-Kacheln für DACH (wie onrouteprem). */
export interface ImportTile {
  id: string
  region: string
  south: number
  west: number
  north: number
  east: number
}

export function dachImportTiles(regionFilter?: string): ImportTile[] {
  const regions = [
    { name: 'AT', south: 46.4, west: 9.5, north: 49.1, east: 17.2 },
    { name: 'CH', south: 45.8, west: 5.9, north: 47.8, east: 10.5 },
    { name: 'DE', south: 47.2, west: 5.8, north: 55.1, east: 15.1 },
    { name: 'LI', south: 47.0, west: 9.4, north: 47.3, east: 9.7 },
  ]

  const tiles: ImportTile[] = []

  for (const region of regions) {
    if (regionFilter && region.name !== regionFilter) continue

    for (let lat = Math.floor(region.south); lat < region.north; lat += 1) {
      for (let lng = Math.floor(region.west); lng < region.east; lng += 1) {
        const south = Math.max(lat, region.south)
        const west = Math.max(lng, region.west)
        const north = Math.min(lat + 1, region.north)
        const east = Math.min(lng + 1, region.east)
        if (north <= south || east <= west) continue

        tiles.push({
          id: `${region.name}_${lat}_${lng}`,
          region: region.name,
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

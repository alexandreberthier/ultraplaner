import type { Poi, PoiCategory } from '../../shared/types'

export type OsmFilter = {
  key: string
  value: string
  subType: string
  category: PoiCategory
  /** Also import area geometries (ways) via Overpass `out center` / PBF centroids. */
  includeWays?: boolean
}

export const OSM_FILTERS: OsmFilter[] = [
  { key: 'amenity', value: 'fuel', subType: 'Tankstelle', category: 'fuel' },
  { key: 'shop', value: 'supermarket', subType: 'Supermarkt', category: 'supermarket' },
  { key: 'shop', value: 'convenience', subType: 'Tante-Mi-Laden', category: 'supermarket' },
  { key: 'shop', value: 'bakery', subType: 'Bäckerei', category: 'gastronomy' },
  { key: 'amenity', value: 'fast_food', subType: 'Fast Food', category: 'gastronomy' },
  { key: 'amenity', value: 'cafe', subType: 'Café', category: 'gastronomy' },
  { key: 'amenity', value: 'restaurant', subType: 'Restaurant', category: 'gastronomy' },
  { key: 'amenity', value: 'drinking_water', subType: 'Trinkbrunnen', category: 'water' },
  { key: 'natural', value: 'spring', subType: 'Quelle', category: 'water' },
  { key: 'man_made', value: 'water_well', subType: 'Brunnen', category: 'water' },
  // Cemeteries often have outdoor taps — useful ultracycling water sources
  {
    key: 'amenity',
    value: 'grave_yard',
    subType: 'Friedhof',
    category: 'water',
    includeWays: true,
  },
  {
    key: 'landuse',
    value: 'cemetery',
    subType: 'Friedhof',
    category: 'water',
    includeWays: true,
  },
  { key: 'shop', value: 'beverages', subType: 'Getränkemarkt', category: 'beverages' },
  { key: 'tourism', value: 'hotel', subType: 'Hotel', category: 'hotel' },
  { key: 'tourism', value: 'guest_house', subType: 'Pension', category: 'hotel' },
  { key: 'tourism', value: 'hostel', subType: 'Hostel', category: 'hotel' },
  { key: 'tourism', value: 'camp_site', subType: 'Campingplatz', category: 'campsite' },
  { key: 'shop', value: 'bicycle', subType: 'Radladen', category: 'bike' },
  { key: 'craft', value: 'bicycle', subType: 'Radwerkstatt', category: 'bike' },
  { key: 'amenity', value: 'bicycle_repair_station', subType: 'Reparaturstation', category: 'bike' },
]

export interface OsmElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
  /** Node ids for ways (PBF parser). */
  refs?: number[]
}

export function elementToPoi(el: OsmElement): Poi | null {
  const tags = el.tags
  if (!tags) return null

  const match = OSM_FILTERS.find((f) => tags[f.key] === f.value)
  if (!match) return null

  const lat = el.lat ?? el.center?.lat
  const lng = el.lon ?? el.center?.lon
  if (lat == null || lng == null) return null

  const addr = [tags['addr:street'], tags['addr:city']].filter(Boolean).join(', ')
  const name = tags.name ?? tags.brand ?? tags.operator ?? (addr || match.subType)
  const openingHours = tags.opening_hours?.trim() || undefined

  return {
    id: `${el.type}/${el.id}`,
    name,
    category: match.category,
    lat,
    lng,
    subType: match.subType,
    ...(openingHours ? { openingHours } : {}),
  }
}

export function buildBboxNodeQuery(
  bbox: { south: number; west: number; north: number; east: number },
  filters: OsmFilter[]
): string {
  const box = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`
  const parts = filters.flatMap((f) => {
    const lines = [`  node["${f.key}"="${f.value}"](${box});`]
    if (f.includeWays) lines.push(`  way["${f.key}"="${f.value}"](${box});`)
    return lines
  })
  const needsCenter = filters.some((f) => f.includeWays)

  return `[out:json][timeout:120];
(
${parts.join('\n')}
);
${needsCenter ? 'out center qt;' : 'out body qt;'}`
}

import type { Poi, PoiCategory } from '../../shared/types'

export type OsmFilter = { key: string; value: string; subType: string; category: PoiCategory }

export const OSM_FILTERS: OsmFilter[] = [
  { key: 'amenity', value: 'fuel', subType: 'Tankstelle', category: 'fuel' },
  { key: 'shop', value: 'supermarket', subType: 'Supermarkt', category: 'food' },
  { key: 'shop', value: 'convenience', subType: 'Tante-Mi-Laden', category: 'food' },
  { key: 'shop', value: 'bakery', subType: 'Bäckerei', category: 'food' },
  { key: 'amenity', value: 'fast_food', subType: 'Fast Food', category: 'food' },
  { key: 'amenity', value: 'cafe', subType: 'Café', category: 'food' },
  { key: 'amenity', value: 'restaurant', subType: 'Restaurant', category: 'restaurant' },
  { key: 'amenity', value: 'drinking_water', subType: 'Trinkbrunnen', category: 'water' },
  { key: 'natural', value: 'spring', subType: 'Quelle', category: 'water' },
  { key: 'man_made', value: 'water_well', subType: 'Brunnen', category: 'water' },
  { key: 'shop', value: 'beverages', subType: 'Getränkemarkt', category: 'water' },
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

  return {
    id: `${el.type}/${el.id}`,
    name,
    category: match.category,
    lat,
    lng,
    subType: match.subType,
  }
}

export function buildBboxNodeQuery(
  bbox: { south: number; west: number; north: number; east: number },
  filters: OsmFilter[]
): string {
  const box = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`
  const parts = filters.map((f) => `  node["${f.key}"="${f.value}"](${box});`)

  return `[out:json][timeout:120];
(
${parts.join('\n')}
);
out body qt;`
}

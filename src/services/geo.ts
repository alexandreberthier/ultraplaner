const EARTH_RADIUS_M = 6_371_000

export function haversineM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

export function haversineCoords(a: [number, number], b: [number, number]): number {
  return haversineM({ lat: a[1], lng: a[0] }, { lat: b[1], lng: b[0] })
}

export function bboxFromCoords(
  coords: [number, number][],
  bufferM: number
): { south: number; west: number; north: number; east: number } {
  let south = Infinity
  let north = -Infinity
  let west = Infinity
  let east = -Infinity

  for (const [lng, lat] of coords) {
    south = Math.min(south, lat)
    north = Math.max(north, lat)
    west = Math.min(west, lng)
    east = Math.max(east, lng)
  }

  const bufferDeg = bufferM / 111_000
  return {
    south: south - bufferDeg,
    west: west - bufferDeg,
    north: north + bufferDeg,
    east: east + bufferDeg,
  }
}

export function sampleCoords(
  coords: [number, number][],
  maxPoints = 80
): [number, number][] {
  if (coords.length <= maxPoints) return coords
  const step = Math.ceil(coords.length / maxPoints)
  return coords.filter((_, i) => i % step === 0)
}

export function isInBbox(
  lat: number,
  lng: number,
  bbox: { south: number; west: number; north: number; east: number }
): boolean {
  return lat >= bbox.south && lat <= bbox.north && lng >= bbox.west && lng <= bbox.east
}

export function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`
  return `${Math.round(meters)} m`
}

export function formatKm(km: number): string {
  return `${km.toFixed(1)} km`
}

/** BCP-47 tags for Intl grouping (DE uses `.` thousands sep). */
const LOCALE_TAGS: Record<string, string> = {
  de: 'de-DE',
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
}

/** Full integer with locale thousands separators — never compact/`k`. */
export function formatLocaleInt(n: number, locale = 'de'): string {
  const tag = LOCALE_TAGS[locale] ?? locale
  return new Intl.NumberFormat(tag, { maximumFractionDigits: 0 }).format(Math.round(n))
}

/** Elevation meters, e.g. `3.100 m` (de) / `3,100 m` (en). */
export function formatElevM(meters: number, locale = 'de'): string {
  return `${formatLocaleInt(meters, locale)} m`
}

/** Whole kilometres with locale grouping, e.g. `1.250 km`. */
export function formatKmInt(km: number, locale = 'de'): string {
  return `${formatLocaleInt(km, locale)} km`
}

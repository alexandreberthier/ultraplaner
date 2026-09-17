/**
 * Google Maps place / search view (hours, reviews) — no API key required.
 *
 * Chain brands (Billa, Lidl) rank poorly with name-only or coords-only queries.
 * Prefer "Name, street, city" when we have an OSM address; otherwise coords+name
 * with a locked viewport. Still weaker than Places API locationBias.
 */
export function googleMapsPlaceUrl(
  lat: number,
  lng: number,
  name?: string | null,
  opts?: { categoryLabel?: string | null; address?: string | null }
): string {
  const label = name?.trim()
  const address = opts?.address?.trim()
  if (!label && !address) {
    return `https://www.google.com/maps/search/?api=1&query=${lat}%2C${lng}`
  }

  if (label && address) {
    const query = `${label}, ${address}`
    return `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${lat},${lng},18z`
  }

  const cat = opts?.categoryLabel?.trim()
  let placeName = label || address || ''
  if (label && cat && label.split(/\s+/).length === 1) {
    const lower = label.toLowerCase()
    if (!lower.includes(cat.toLowerCase())) {
      placeName = `${label} ${cat}`
    }
  }

  const query = `${lat},${lng} ${placeName}`
  return `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${lat},${lng},18z`
}

/** Google Maps turn-by-turn directions — no API key required. */
export function googleMapsDirectionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
}

type ReverseAddress = {
  road?: string
  house_number?: string
  postcode?: string
  city?: string
  town?: string
  village?: string
  municipality?: string
}

/** Best-effort locality for Maps matching when OSM address was not stored on the POI. */
export async function reverseGeocodeAddress(lat: number, lng: number): Promise<string | null> {
  const orsKey = import.meta.env.VITE_ORS_API_KEY as string | undefined
  if (orsKey) {
    const fromOrs = await reverseViaOrs(lat, lng, orsKey)
    if (fromOrs) return fromOrs
  }
  return reverseViaNominatim(lat, lng)
}

async function reverseViaOrs(lat: number, lng: number, key: string): Promise<string | null> {
  const urls = [
    `https://api.heigit.org/pelias/v1/reverse?point.lat=${lat}&point.lon=${lng}&size=1`,
    `https://api.openrouteservice.org/geocode/reverse?api_key=${encodeURIComponent(key)}&point.lat=${lat}&point.lon=${lng}&size=1`,
  ]
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: url.includes('openrouteservice.org')
          ? { Authorization: key, Accept: 'application/json' }
          : { Accept: 'application/json' },
      })
      if (!res.ok) continue
      const json = (await res.json()) as {
        features?: { properties?: Record<string, string | undefined> }[]
      }
      const p = json.features?.[0]?.properties
      if (!p) continue
      const street = [p.street || p.name, p.housenumber].filter(Boolean).join(' ')
      const place = [p.postalcode, p.locality || p.county || p.region].filter(Boolean).join(' ')
      // Prefer street+place; Pelias "label" is a good fallback
      const line = [street, place].filter(Boolean).join(', ')
      if (line) return line
      if (p.label?.trim()) return p.label.trim()
    } catch {
      /* try next */
    }
  }
  return null
}

async function reverseViaNominatim(lat: number, lng: number): Promise<string | null> {
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}` +
      `&zoom=18&addressdetails=1`
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'de',
      },
    })
    if (!res.ok) return null
    const json = (await res.json()) as { address?: ReverseAddress }
    const a = json.address
    if (!a) return null
    const street = [a.road, a.house_number].filter(Boolean).join(' ')
    const place = [a.postcode, a.city || a.town || a.village || a.municipality]
      .filter(Boolean)
      .join(' ')
    const line = [street, place].filter(Boolean).join(', ')
    return line || null
  } catch {
    return null
  }
}

/**
 * Google Maps place / search view (hours, reviews) — no API key required.
 *
 * Pure lat,lng pins often sit a few metres beside Google's business centroid
 * (OSM entrance/parcel vs Maps place), so the Place card with hours never opens.
 * Searching "Name @lat,lng" lets Maps resolve the nearest matching Place.
 */
export function googleMapsPlaceUrl(
  lat: number,
  lng: number,
  name?: string | null
): string {
  const label = name?.trim()
  if (label) {
    const query = `${label} @${lat},${lng}`
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
  }
  return `https://www.google.com/maps/search/?api=1&query=${lat}%2C${lng}`
}

/** Google Maps turn-by-turn directions — no API key required. */
export function googleMapsDirectionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
}

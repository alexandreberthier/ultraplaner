/**
 * Google Maps place / search view (hours, reviews) — no API key required.
 *
 * Pure lat,lng pins often sit beside Google's business centroid (no Place card).
 * "Name @lat,lng" as a query string is treated as a brand search and can jump to
 * distant hits (e.g. Marcher → Fleischwerke Graz). Scope the search to the map
 * viewport via /search/Query/@lat,lng,zoom and enrich short names with category.
 */
export function googleMapsPlaceUrl(
  lat: number,
  lng: number,
  name?: string | null,
  categoryLabel?: string | null
): string {
  const label = name?.trim()
  if (!label) {
    return `https://www.google.com/maps/search/?api=1&query=${lat}%2C${lng}`
  }

  const cat = categoryLabel?.trim()
  let query = label
  // Short brand-like names need a type hint so Maps stays local
  if (cat && label.split(/\s+/).length <= 2) {
    const lower = label.toLowerCase()
    if (!lower.includes(cat.toLowerCase())) {
      query = `${label} ${cat}`
    }
  }

  // Path form pins the search to this map area (unlike query=Name @coords)
  return `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${lat},${lng},17z`
}

/** Google Maps turn-by-turn directions — no API key required. */
export function googleMapsDirectionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
}

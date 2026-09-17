/**
 * Google Maps place / search view (hours, reviews) — no API key required.
 *
 * Pure lat,lng pins often sit beside Google's business centroid (no Place card).
 * Brand-only queries ("Billa Plus Supermärkte") list distant chain stores.
 * Put coordinates first and only append category for single-token names
 * ("Marcher" → "Marcher Tankstellen"), then lock the map viewport.
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
  let placeName = label
  // Only one-word brands need a type hint; "Billa Plus" + "Supermärkte" → nationwide list
  if (cat && label.split(/\s+/).length === 1) {
    const lower = label.toLowerCase()
    if (!lower.includes(cat.toLowerCase())) {
      placeName = `${label} ${cat}`
    }
  }

  // Coords first biases ranking to this spot; @lat,lng locks the visible area
  const query = `${lat},${lng} ${placeName}`
  return `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${lat},${lng},18z`
}

/** Google Maps turn-by-turn directions — no API key required. */
export function googleMapsDirectionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
}

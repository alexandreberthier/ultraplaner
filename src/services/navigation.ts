/** Google Maps directions — no API key required. */
export function googleMapsDirectionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
}

/** Open POI in Google Maps (view / search). */
export function googleMapsPlaceUrl(lat: number, lng: number, name?: string): string {
  const q = name ? encodeURIComponent(name) : `${lat},${lng}`
  return `https://www.google.com/maps/search/?api=1&query=${q}&query=${lat},${lng}`
}

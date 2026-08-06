/** Google Maps directions — no API key required. */
export function googleMapsDirectionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
}

/** Apple Maps directions (works on iOS / macOS; falls back in browsers). */
export function appleMapsDirectionsUrl(lat: number, lng: number, name?: string): string {
  const params = new URLSearchParams({
    daddr: `${lat},${lng}`,
    dirflg: 'd',
  })
  if (name) params.set('q', name)
  return `https://maps.apple.com/?${params.toString()}`
}

/** Generic geo: URI for native maps apps (Android and many browsers). */
export function geoDirectionsUri(lat: number, lng: number, name?: string): string {
  const label = name ? encodeURIComponent(name) : `${lat},${lng}`
  return `geo:${lat},${lng}?q=${lat},${lng}(${label})`
}

/** Open POI in Google Maps (view / search). */
export function googleMapsPlaceUrl(lat: number, lng: number, name?: string): string {
  const q = name ? encodeURIComponent(name) : `${lat},${lng}`
  return `https://www.google.com/maps/search/?api=1&query=${q}&query=${lat},${lng}`
}

/** Platform-preferred directions URL for a one-tap „Navigieren“. */
export function preferredDirectionsUrl(
  lat: number,
  lng: number,
  opts?: { apple?: boolean; name?: string }
): string {
  if (opts?.apple) return appleMapsDirectionsUrl(lat, lng, opts.name)
  return googleMapsDirectionsUrl(lat, lng)
}

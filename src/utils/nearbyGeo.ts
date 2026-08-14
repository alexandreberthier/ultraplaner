export const NEARBY_GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 30_000,
  timeout: 20_000,
}

export function nearbyGeoBlockedReason(): 'insecure' | 'unsupported' | null {
  if (typeof window !== 'undefined' && !window.isSecureContext) return 'insecure'
  if (typeof navigator === 'undefined' || !navigator.geolocation) return 'unsupported'
  return null
}

export function nearbyGeoErrorI18nKey(code: number): string {
  if (code === 1) return 'nearby.geoDenied'
  if (code === 2) return 'nearby.geoUnavailable'
  if (code === 3) return 'nearby.geoTimeout'
  return 'nearby.geoFailed'
}

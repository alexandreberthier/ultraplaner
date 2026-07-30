import type { LatLng, RouteSurfaceSummary } from '../../shared/types'
import { GEOCODE_BBOX } from '../config/poiCategories'
import { tGlobal } from '../i18n'
import { bucketOrsSurfaceSummary, type OrsSurfaceSummaryRow } from '../utils/surface'

export type CyclingProfile = 'cycling-regular'

export const CYCLING_PROFILE: CyclingProfile = 'cycling-regular'

export interface GeocodeResult {
  lat: number
  lng: number
  label: string
}

export interface CyclingRouteResult {
  coordinates: [number, number][]
  elevations: number[]
  surfaceSummary: RouteSurfaceSummary | null
}

function orsKey(): string {
  const key = import.meta.env.VITE_ORS_API_KEY
  if (!key) {
    throw new Error(tGlobal('routing.orsKeyMissing'))
  }
  return key
}

export function isOrsConfigured(): boolean {
  return Boolean(import.meta.env.VITE_ORS_API_KEY)
}

/** Search addresses in supported Central European region. */
export async function searchAddresses(query: string, limit = 6): Promise<GeocodeResult[]> {
  const text = query.trim()
  if (text.length < 2) return []

  const params = new URLSearchParams({
    text,
    size: String(limit),
    'boundary.rect.min_lon': String(GEOCODE_BBOX.minLon),
    'boundary.rect.min_lat': String(GEOCODE_BBOX.minLat),
    'boundary.rect.max_lon': String(GEOCODE_BBOX.maxLon),
    'boundary.rect.max_lat': String(GEOCODE_BBOX.maxLat),
  })

  const res = await fetch(`https://api.openrouteservice.org/geocode/search?${params}`, {
    headers: { Authorization: orsKey() },
  })

  if (!res.ok) {
    if (res.status === 429) throw new Error(tGlobal('routing.rateLimited'))
    return []
  }

  const data = (await res.json()) as {
    features?: {
      geometry?: { coordinates?: [number, number] }
      properties?: { label?: string; name?: string }
    }[]
  }

  return (data.features ?? [])
    .map((f) => {
      const [lng, lat] = f.geometry?.coordinates ?? []
      if (lat == null || lng == null) return null
      const label = f.properties?.label ?? f.properties?.name ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`
      return { lat, lng, label }
    })
    .filter((r): r is GeocodeResult => r != null)
}

/** Fetch a cycling route through waypoints via OpenRouteService (free tier). */
export async function fetchCyclingRoute(
  waypoints: LatLng[],
  profile: CyclingProfile = CYCLING_PROFILE
): Promise<CyclingRouteResult> {
  const key = orsKey()

  if (waypoints.length < 2) {
    throw new Error(tGlobal('routing.minWaypoints'))
  }

  const coordinates = waypoints.map((w) => [w.lng, w.lat])
  // Default ORS snap radius is only 350 m — mountain/parking clicks often fail (code 2010).
  const radiuses = waypoints.map(() => 2000)

  const res = await fetch(
    `https://api.openrouteservice.org/v2/directions/${profile}/geojson`,
    {
      method: 'POST',
      headers: {
        Authorization: key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        coordinates,
        elevation: true,
        radiuses,
        extra_info: ['surface'],
      }),
    }
  )

  if (!res.ok) {
    let detail = res.statusText
    try {
      const err = (await res.json()) as { error?: { message?: string } }
      detail = err.error?.message ?? detail
    } catch {
      /* ignore */
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(tGlobal('routing.invalidKey'))
    }
    if (res.status === 429) {
      throw new Error(tGlobal('routing.dailyLimit'))
    }
    throw new Error(tGlobal('routing.routeCalcFailed', { detail }))
  }

  const data = (await res.json()) as {
    features?: {
      geometry?: { type?: string; coordinates?: ([number, number] | [number, number, number])[] }
      properties?: {
        extras?: {
          surface?: {
            summary?: OrsSurfaceSummaryRow[]
          }
        }
      }
    }[]
  }

  const feature = data.features?.[0]
  const line = feature?.geometry
  if (line?.type !== 'LineString' || !line.coordinates?.length) {
    throw new Error(tGlobal('routing.noRouteFound'))
  }

  const coords: [number, number][] = []
  const elevations: number[] = []
  for (const c of line.coordinates) {
    coords.push([c[0], c[1]])
    if (c.length >= 3 && typeof c[2] === 'number') elevations.push(c[2])
  }

  const surfaceSummary = bucketOrsSurfaceSummary(
    feature?.properties?.extras?.surface?.summary
  )

  return {
    coordinates: coords,
    elevations: elevations.length === coords.length ? elevations : [],
    surfaceSummary,
  }
}

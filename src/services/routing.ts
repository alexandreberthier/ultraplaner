import type { LatLng, RouteSurfaceSummary } from '../../shared/types'
import { GEOCODE_BBOX } from '../config/poiCategories'
import { tGlobal } from '../i18n'
import { bucketOrsSurfaceSummary, type OrsSurfaceSummaryRow } from '../utils/surface'

/** ORS cycling profiles — surface bias is baked into the profile, not a separate surface filter. */
export type CyclingProfile =
  | 'cycling-regular'
  | 'cycling-road'
  | 'cycling-mountain'
  | 'cycling-electric'

export const CYCLING_PROFILES: readonly CyclingProfile[] = [
  'cycling-regular',
  'cycling-road',
  'cycling-mountain',
  'cycling-electric',
] as const

export const CYCLING_PROFILE: CyclingProfile = 'cycling-regular'

/**
 * Simplified planner surface choice (maps to ORS cycling profiles).
 * asphalt → cycling-road; mixed → cycling-regular (paths + streets).
 */
export type SurfacePreference = 'asphalt' | 'mixed'

export const SURFACE_PREFERENCES: readonly SurfacePreference[] = ['asphalt', 'mixed'] as const

export function cyclingProfileForSurface(surface: SurfacePreference): CyclingProfile {
  return surface === 'asphalt' ? 'cycling-road' : 'cycling-regular'
}

/**
 * Hill preference via ORS steepness_difficulty (cycling only).
 * ORS levels 0–3 = novice→pro; preferred gradient rises with the value.
 * Level 0 heavily penalises hills (long detours, often more total ascent) — skip it.
 * balanced→1 (moderate), steep→3 (pro / hills OK).
 */
export type HillPreference = 'balanced' | 'steep'

export const HILL_PREFERENCES: readonly HillPreference[] = ['balanced', 'steep'] as const

export interface RouteRequestOptions {
  profile?: CyclingProfile
  hillPreference?: HillPreference
  /** Default true — avoid stairways on bike routes. */
  avoidSteps?: boolean
  avoidFerries?: boolean
  /** Cancel in-flight ORS request (profile/surface toggles). */
  signal?: AbortSignal
}

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

export function isRouteAborted(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const name = (err as { name?: string }).name
  return name === 'AbortError' || name === 'OrsRouteAbortedError'
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

function steepnessDifficulty(hill: HillPreference | undefined): number | null {
  if (hill === 'balanced') return 1
  if (hill === 'steep') return 3
  return null
}

function buildOrsOptions(opts: RouteRequestOptions): Record<string, unknown> | undefined {
  const avoid: string[] = []
  if (opts.avoidSteps !== false) avoid.push('steps')
  if (opts.avoidFerries) avoid.push('ferries')

  const difficulty = steepnessDifficulty(opts.hillPreference)
  const profileParams =
    difficulty != null
      ? { weightings: { steepness_difficulty: difficulty } }
      : undefined

  if (!avoid.length && !profileParams) return undefined

  return {
    ...(avoid.length ? { avoid_features: avoid } : {}),
    ...(profileParams ? { profile_params: profileParams } : {}),
  }
}

function finiteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    const err = new DOMException('Aborted', 'AbortError')
    throw err
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(() => resolve(), ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function isTransientOrsStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504
}

function isNetworkFailure(err: unknown): boolean {
  if (isRouteAborted(err)) return false
  if (err instanceof TypeError) return true
  if (err instanceof Error) {
    return /network|failed to fetch|NetworkError|Load failed/i.test(err.message)
  }
  return false
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
      const lng = finiteNumber(f.geometry?.coordinates?.[0])
      const lat = finiteNumber(f.geometry?.coordinates?.[1])
      if (lat == null || lng == null) return null
      const label = f.properties?.label ?? f.properties?.name ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`
      return { lat, lng, label }
    })
    .filter((r): r is GeocodeResult => r != null)
}

type OrsGeoJson = {
  features?: {
    geometry?: { type?: string; coordinates?: ([number, number] | [number, number, number | null])[] }
    properties?: {
      extras?: {
        surface?: {
          summary?: OrsSurfaceSummaryRow[]
        }
      }
    }
  }[]
}

function parseOrsRoute(data: OrsGeoJson): CyclingRouteResult {
  const feature = data.features?.[0]
  const line = feature?.geometry
  if (line?.type !== 'LineString' || !line.coordinates?.length) {
    throw new Error(tGlobal('routing.noRouteFound'))
  }

  const coords: [number, number][] = []
  const elevRaw: (number | null)[] = []
  for (const c of line.coordinates) {
    const lng = finiteNumber(c[0])
    const lat = finiteNumber(c[1])
    if (lng == null || lat == null) continue
    coords.push([lng, lat])
    elevRaw.push(c.length >= 3 ? finiteNumber(c[2]) : null)
  }

  if (coords.length < 2) {
    throw new Error(tGlobal('routing.noRouteFound'))
  }

  // Keep elevation only when every kept vertex has a finite Z (null → 0 would fake flats).
  const elevations =
    elevRaw.length === coords.length && elevRaw.every((e) => e != null)
      ? (elevRaw as number[])
      : elevRaw.length === coords.length && elevRaw.some((e) => e != null)
        ? elevRaw.map((e) => e ?? 0)
        : []

  const surfaceSummary = bucketOrsSurfaceSummary(
    feature?.properties?.extras?.surface?.summary
  )

  return {
    coordinates: coords,
    elevations,
    surfaceSummary,
  }
}

async function postOrsDirections(
  profile: CyclingProfile,
  body: Record<string, unknown>,
  key: string,
  signal?: AbortSignal
): Promise<Response> {
  return fetch(`https://api.openrouteservice.org/v2/directions/${profile}/geojson`, {
    method: 'POST',
    headers: {
      Authorization: key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  })
}

/**
 * Fetch a cycling route through waypoints via OpenRouteService (free tier).
 * Retries transient 503/network once with short backoff; asphalt (cycling-road)
 * falls back to cycling-regular after exhausted 503 retries.
 */
export async function fetchCyclingRoute(
  waypoints: LatLng[],
  profileOrOpts: CyclingProfile | RouteRequestOptions = CYCLING_PROFILE
): Promise<CyclingRouteResult> {
  const key = orsKey()

  if (waypoints.length < 2) {
    throw new Error(tGlobal('routing.minWaypoints'))
  }

  const opts: RouteRequestOptions =
    typeof profileOrOpts === 'string' ? { profile: profileOrOpts } : profileOrOpts
  const profile = opts.profile ?? CYCLING_PROFILE
  const signal = opts.signal

  const coordinates = waypoints.map((w) => [w.lng, w.lat])
  // Default ORS snap radius is only 350 m — mountain/parking clicks often fail (code 2010).
  const radiuses = waypoints.map(() => 2000)
  const options = buildOrsOptions(opts)
  const body: Record<string, unknown> = {
    coordinates,
    elevation: true,
    radiuses,
    extra_info: ['surface'],
    ...(options ? { options } : {}),
  }

  const profilesToTry: CyclingProfile[] =
    profile === 'cycling-road' ? ['cycling-road', 'cycling-regular'] : [profile]

  let lastBusy = false
  let lastNetwork = false

  for (let pi = 0; pi < profilesToTry.length; pi++) {
    const tryProfile = profilesToTry[pi]!
    const maxAttempts = 2 // initial + 1 backoff retry

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      throwIfAborted(signal)
      let res: Response
      try {
        res = await postOrsDirections(tryProfile, body, key, signal)
      } catch (err) {
        if (isRouteAborted(err)) throw err
        if (isNetworkFailure(err)) {
          lastNetwork = true
          if (attempt < maxAttempts - 1) {
            await sleep(450 + attempt * 350, signal)
            continue
          }
          break
        }
        throw err
      }

      if (res.ok) {
        const data = (await res.json()) as OrsGeoJson
        throwIfAborted(signal)
        return parseOrsRoute(data)
      }

      if (res.status === 401 || res.status === 403) {
        throw new Error(tGlobal('routing.invalidKey'))
      }
      if (res.status === 429) {
        throw new Error(tGlobal('routing.dailyLimit'))
      }

      if (isTransientOrsStatus(res.status)) {
        lastBusy = true
        if (attempt < maxAttempts - 1) {
          await sleep(450 + attempt * 350, signal)
          continue
        }
        break
      }

      let detail = res.statusText
      try {
        const errBody = (await res.json()) as { error?: { message?: string } }
        detail = errBody.error?.message ?? detail
      } catch {
        /* ignore */
      }
      throw new Error(tGlobal('routing.routeCalcFailed', { detail }))
    }

    // Fallback cycling-road → cycling-regular only after transient/network exhaustion.
    if (pi === 0 && profilesToTry.length > 1 && (lastBusy || lastNetwork)) {
      continue
    }
    break
  }

  if (lastNetwork) throw new Error(tGlobal('routing.networkError'))
  if (lastBusy) throw new Error(tGlobal('routing.serviceBusy'))
  throw new Error(tGlobal('routing.routeCalcFailed', { detail: '' }))
}

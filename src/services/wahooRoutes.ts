import type { RoutePoint } from '../../shared/types'
import { getWahooAccessToken } from './wahooAuth'

const API_BASE = 'https://api.wahooligan.com/v1'
/** Wahoo workout_type_family_id: 0 = BIKING */
const BIKING_FAMILY = 0

export type WahooRouteUploadInput = {
  name: string
  description?: string
  externalId: string
  fitBytes: Uint8Array
  routePoints: RoutePoint[]
  distanceM: number
  ascentM: number
  descentM?: number
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunk = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** Cumulative ascent / descent from route elevations (meters). */
export function routeElevationStats(points: RoutePoint[]): { ascentM: number; descentM: number } {
  let ascentM = 0
  let descentM = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!.elevation
    const b = points[i]!.elevation
    if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) continue
    const diff = b - a
    if (diff > 0) ascentM += diff
    else descentM += -diff
  }
  return { ascentM, descentM }
}

function buildRouteBody(input: WahooRouteUploadInput, opts: { includeExternalId: boolean }): URLSearchParams {
  const start = input.routePoints[0]!
  const fileB64 = bytesToBase64(input.fitBytes)
  const body = new URLSearchParams()
  body.set('route[file]', `data:application/vnd.fit;base64,${fileB64}`)
  body.set('route[filename]', `${input.name.slice(0, 40) || 'route'}.fit`)
  if (opts.includeExternalId) {
    body.set('route[external_id]', input.externalId.slice(0, 64))
  }
  body.set('route[provider_updated_at]', new Date().toISOString())
  body.set('route[name]', input.name.slice(0, 80) || 'UltraPlaner')
  if (input.description) body.set('route[description]', input.description.slice(0, 240))
  body.set('route[workout_type_family_id]', String(BIKING_FAMILY))
  body.set('route[start_lat]', String(start.lat))
  body.set('route[start_lng]', String(start.lng))
  // Wahoo API: metres (not km). A 300 km route must be ~300000.
  body.set('route[distance]', String(Math.max(0, Math.round(input.distanceM))))
  body.set('route[ascent]', String(Math.max(0, Math.round(input.ascentM))))
  if (input.descentM != null) {
    body.set('route[descent]', String(Math.max(0, Math.round(input.descentM))))
  }
  return body
}

type WahooRouteRow = { id?: number | string; external_id?: string; distance?: number }

async function findRouteByExternalId(
  token: string,
  externalId: string
): Promise<WahooRouteRow | null> {
  const url = `${API_BASE}/routes?external_id=${encodeURIComponent(externalId)}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  if (!res.ok) return null
  const data = (await res.json()) as WahooRouteRow[] | { routes?: WahooRouteRow[] }
  const rows = Array.isArray(data) ? data : (data.routes ?? [])
  const match =
    rows.find((r) => r.external_id === externalId) ?? (rows.length === 1 ? rows[0] : undefined)
  return match?.id != null ? match : null
}

/**
 * Upload or replace a Wahoo cloud route.
 * Re-POSTing the same external_id often keeps the old metadata (e.g. 300 m instead of 300 km),
 * so we look up + PUT when a route already exists.
 */
export async function uploadWahooRoute(input: WahooRouteUploadInput): Promise<{ id: number | string }> {
  if (!input.routePoints[0]) throw new Error('Route empty')

  const token = await getWahooAccessToken()

  // Prefer current id; also try legacy id without "-m" (pre distance-unit fix).
  const candidates = [input.externalId]
  if (input.externalId.endsWith('-m')) {
    candidates.push(input.externalId.slice(0, -2))
  }

  let existing: WahooRouteRow | null = null
  for (const eid of candidates) {
    existing = await findRouteByExternalId(token, eid)
    if (existing) break
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/x-www-form-urlencoded',
  }

  if (existing?.id != null) {
    const body = buildRouteBody(input, { includeExternalId: false })
    const res = await fetch(`${API_BASE}/routes/${existing.id}`, {
      method: 'PUT',
      headers,
      body,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Wahoo route update ${res.status}: ${text.slice(0, 240)}`)
    }
    const data = (await res.json().catch(() => ({}))) as { id?: number | string; distance?: number }
    return { id: data.id ?? existing.id }
  }

  const body = buildRouteBody(input, { includeExternalId: true })
  const res = await fetch(`${API_BASE}/routes`, {
    method: 'POST',
    headers,
    body,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Wahoo route upload ${res.status}: ${text.slice(0, 240)}`)
  }

  const data = (await res.json()) as { id?: number | string }
  if (data.id == null) throw new Error('Wahoo route response missing id')
  return { id: data.id }
}

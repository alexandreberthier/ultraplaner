import type {
  ControlPoint,
  FavoriteMeta,
  Poi,
  PoiCategory,
  RoutePoint,
  RouteSurfaceSummary,
} from '../../shared/types'

const KEY = 'ultraplaner-view-session'
const VERSION = 1

export type ViewSessionSnapshot = {
  v: number
  nearby: boolean
  name: string
  coords: [number, number][]
  points: RoutePoint[]
  radiusM: number
  categories: PoiCategory[]
  pois: Poi[]
  favorites: string[]
  favoriteMeta: Record<string, FavoriteMeta>
  controlPoints: ControlPoint[]
  surfaceSummary: RouteSurfaceSummary | null
}

function canUseSession(): boolean {
  return typeof sessionStorage !== 'undefined'
}

export function writeViewSession(snap: ViewSessionSnapshot): void {
  if (!canUseSession() || snap.coords.length < 1) return
  const payload: ViewSessionSnapshot = { ...snap, v: VERSION }
  try {
    sessionStorage.setItem(KEY, JSON.stringify(payload))
  } catch {
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ ...payload, pois: [] }))
    } catch {
      /* quota / private mode */
    }
  }
}

export function readViewSession(): ViewSessionSnapshot | null {
  if (!canUseSession()) return null
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ViewSessionSnapshot
    if (parsed?.v !== VERSION || !Array.isArray(parsed.coords) || parsed.coords.length < 1) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function clearViewSession(): void {
  if (!canUseSession()) return
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

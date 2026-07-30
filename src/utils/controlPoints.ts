import type { ControlPoint, ControlPointKind, Poi, PoiCategory } from '../../shared/types'
import { nearestPointOnRoute } from '../services/poiFilter'
import type { RoutePoint } from '../../shared/types'

const KIND_TO_CATEGORY: Record<ControlPointKind, PoiCategory> = {
  cp: 'checkpoint',
  sleep: 'sleep',
  border: 'border',
}

export function controlPointCategory(kind: ControlPointKind): PoiCategory {
  return KIND_TO_CATEGORY[kind]
}

export function isControlPointCategory(category: string): boolean {
  return category === 'checkpoint' || category === 'sleep' || category === 'border'
}

export function newControlPointId(): string {
  return `cp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

export function defaultControlPointName(kind: ControlPointKind, existing: ControlPoint[]): string {
  const n = existing.filter((c) => c.kind === kind).length + 1
  if (kind === 'cp') return `CP${n}`
  if (kind === 'sleep') return `Sleep ${n}`
  return `Border ${n}`
}

export function controlPointToPoi(cp: ControlPoint): Poi & { note?: string; label?: string } {
  return {
    id: cp.id,
    name: cp.name,
    label: cp.name,
    category: controlPointCategory(cp.kind),
    lat: cp.lat,
    lng: cp.lng,
    distanceAlongRouteKm: cp.distanceAlongRouteKm,
    subType: cp.kind,
    note: cp.note,
  }
}

/** Snap lat/lng onto route and compute km-along. */
export function placeOnRoute(
  lat: number,
  lng: number,
  routePoints: RoutePoint[]
): { lat: number; lng: number; distanceAlongRouteKm: number; distanceToRouteM: number } {
  const nearest = nearestPointOnRoute({ lat, lng }, routePoints)
  return {
    lat: nearest.lat,
    lng: nearest.lng,
    distanceAlongRouteKm: nearest.distanceAlongRouteKm,
    distanceToRouteM: nearest.distanceToRouteM,
  }
}

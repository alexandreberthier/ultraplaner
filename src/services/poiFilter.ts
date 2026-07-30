import type { Poi, RoutePoint } from '../../shared/types'
import { haversineM } from './geo'

function pointToSegmentDistanceM(
  point: { lat: number; lng: number },
  segStart: { lat: number; lng: number },
  segEnd: { lat: number; lng: number }
): number {
  return projectPointToSegment(point, segStart, segEnd).distanceM
}

/** Closest point on segment + distance (planar t in lon/lat space, haversine for metres). */
function projectPointToSegment(
  point: { lat: number; lng: number },
  segStart: { lat: number; lng: number },
  segEnd: { lat: number; lng: number }
): { lat: number; lng: number; t: number; distanceM: number } {
  const px = point.lng
  const py = point.lat
  const ax = segStart.lng
  const ay = segStart.lat
  const bx = segEnd.lng
  const by = segEnd.lat
  const dx = bx - ax
  const dy = by - ay
  if (dx === 0 && dy === 0) {
    return { lat: segStart.lat, lng: segStart.lng, t: 0, distanceM: haversineM(point, segStart) }
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  const lat = ay + t * dy
  const lng = ax + t * dx
  return { lat, lng, t, distanceM: haversineM(point, { lat, lng }) }
}

function distanceToRouteM(
  point: { lat: number; lng: number },
  route: { lat: number; lng: number }[]
): number {
  if (route.length === 0) return Infinity
  if (route.length === 1) return haversineM(point, route[0]!)
  let min = Infinity
  for (let i = 0; i < route.length - 1; i++) {
    const d = pointToSegmentDistanceM(point, route[i]!, route[i + 1]!)
    if (d < min) min = d
  }
  return min
}

function sampleRoutePoints<T extends { lat: number; lng: number }>(
  route: T[],
  maxPoints = 400
): T[] {
  if (route.length <= maxPoints) return route
  const step = Math.ceil(route.length / maxPoints)
  return route.filter((_, i) => i % step === 0)
}

/** Project a point onto the route; returns km from start. Single-point routes use air distance. */
export function distanceAlongRouteKm(
  poi: { lat: number; lng: number },
  routePoints: RoutePoint[]
): number {
  return nearestPointOnRoute(poi, routePoints).distanceAlongRouteKm
}

/**
 * Snap a POI onto the route polyline (for device GPX/FIT — Wahoo marks off-route
 * waypoints as „Abseits der Route“ without countdown distance).
 */
export function nearestPointOnRoute(
  poi: { lat: number; lng: number },
  routePoints: RoutePoint[]
): {
  lat: number
  lng: number
  distanceAlongRouteKm: number
  distanceToRouteM: number
} {
  if (routePoints.length === 0) {
    return { lat: poi.lat, lng: poi.lng, distanceAlongRouteKm: 0, distanceToRouteM: Infinity }
  }
  if (routePoints.length === 1) {
    const a = routePoints[0]!
    return {
      lat: a.lat,
      lng: a.lng,
      distanceAlongRouteKm: haversineM(poi, a) / 1000,
      distanceToRouteM: haversineM(poi, a),
    }
  }

  const sampled = sampleRoutePoints(routePoints, 500)
  let bestDist = Infinity
  let bestKm = 0
  let bestLat = sampled[0]!.lat
  let bestLng = sampled[0]!.lng
  let accKm = 0

  for (let i = 0; i < sampled.length - 1; i++) {
    const a = sampled[i]!
    const b = sampled[i + 1]!
    const segM = haversineM(a, b)
    const proj = projectPointToSegment(poi, a, b)
    if (proj.distanceM < bestDist) {
      bestDist = proj.distanceM
      bestLat = proj.lat
      bestLng = proj.lng
      bestKm = accKm + (segM * proj.t) / 1000
    }
    accKm += segM / 1000
  }

  return {
    lat: bestLat,
    lng: bestLng,
    distanceAlongRouteKm: bestKm,
    distanceToRouteM: bestDist,
  }
}

export function filterPoisToRoute(
  pois: Poi[],
  routePoints: RoutePoint[],
  radiusM: number,
  categories?: Poi['category'][]
): Poi[] {
  const maxM = radiusM
  const pts = sampleRoutePoints(routePoints, 400)
  if (!pts.length) return []

  const totalKm = routePoints.at(-1)?.distanceFromStart ?? 0
  const catSet = categories ? new Set(categories) : null

  return pois
    .filter((p) => !catSet || catSet.has(p.category))
    .map((poi) => {
      const d = distanceToRouteM(poi, pts)
      const routeKm = distanceAlongRouteKm(poi, routePoints)
      return {
        ...poi,
        distanceToRouteM: d,
        distanceAlongRouteKm: routeKm,
        distanceToFinishKm: totalKm - routeKm,
      }
    })
    .filter((p) => (p.distanceToRouteM ?? Infinity) <= maxM)
    .sort((a, b) => (a.distanceAlongRouteKm ?? 0) - (b.distanceAlongRouteKm ?? 0))
}

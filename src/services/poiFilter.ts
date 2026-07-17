import type { Poi, RoutePoint } from '../../shared/types'
import { haversineM } from './geo'

function pointToSegmentDistanceM(
  point: { lat: number; lng: number },
  segStart: { lat: number; lng: number },
  segEnd: { lat: number; lng: number }
): number {
  const px = point.lng
  const py = point.lat
  const ax = segStart.lng
  const ay = segStart.lat
  const bx = segEnd.lng
  const by = segEnd.lat
  const dx = bx - ax
  const dy = by - ay
  if (dx === 0 && dy === 0) return haversineM(point, segStart)
  const t = Math.max(
    0,
    Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))
  )
  return haversineM(point, { lng: ax + t * dx, lat: ay + t * dy })
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

function distanceAlongRouteKm(
  poi: { lat: number; lng: number },
  routePoints: RoutePoint[]
): number {
  if (routePoints.length < 2) return 0
  const sampled = sampleRoutePoints(routePoints, 500)
  let bestDist = Infinity
  let bestKm = 0
  let accKm = 0

  for (let i = 0; i < sampled.length - 1; i++) {
    const a = sampled[i]!
    const b = sampled[i + 1]!
    const segM = haversineM(a, b)
    const d = pointToSegmentDistanceM(poi, a, b)
    if (d < bestDist) {
      bestDist = d
      const dx = b.lng - a.lng
      const dy = b.lat - a.lat
      const t =
        dx === 0 && dy === 0
          ? 0
          : Math.max(
              0,
              Math.min(1, ((poi.lng - a.lng) * dx + (poi.lat - a.lat) * dy) / (dx * dx + dy * dy))
            )
      bestKm = accKm + (segM * t) / 1000
    }
    accKm += segM / 1000
  }

  return bestKm
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

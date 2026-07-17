import type { RoutePoint } from '../../shared/types'
import { haversineM } from '../services/geo'

export function buildRoutePoints(
  coordinates: [number, number][],
  elevations?: number[]
): RoutePoint[] {
  const simplified = simplifyCoords(coordinates, elevations, 3000)
  const points: RoutePoint[] = []
  let totalM = 0

  for (let i = 0; i < simplified.coords.length; i++) {
    const [lng, lat] = simplified.coords[i]!
    if (i > 0) {
      const prev = simplified.coords[i - 1]!
      totalM += haversineM({ lat: prev[1], lng: prev[0] }, { lat, lng })
    }

    let gradient: number | undefined
    if (i > 0 && simplified.elevations) {
      const prevEle = simplified.elevations[i - 1]
      const currEle = simplified.elevations[i]
      const prev = simplified.coords[i - 1]!
      const distM = haversineM({ lat: prev[1], lng: prev[0] }, { lat, lng })
      if (distM > 1 && prevEle != null && currEle != null) {
        gradient = ((currEle - prevEle) / distM) * 100
      }
    }

    points.push({
      lat,
      lng,
      elevation: simplified.elevations?.[i],
      distanceFromStart: totalM / 1000,
      gradient,
    })
  }

  return points
}

function simplifyCoords(
  coords: [number, number][],
  elevations?: number[],
  maxPoints = 3000
): { coords: [number, number][]; elevations?: number[] } {
  if (coords.length <= maxPoints) {
    return { coords, elevations }
  }
  const step = Math.ceil(coords.length / maxPoints)
  const simplified: [number, number][] = []
  const simplifiedEle: number[] = []
  for (let i = 0; i < coords.length; i += step) {
    simplified.push(coords[i]!)
    if (elevations) simplifiedEle.push(elevations[i] ?? 0)
  }
  const last = coords[coords.length - 1]!
  if (simplified.at(-1)?.[0] !== last[0] || simplified.at(-1)?.[1] !== last[1]) {
    simplified.push(last)
    if (elevations) simplifiedEle.push(elevations[elevations.length - 1] ?? 0)
  }
  return { coords: simplified, elevations: elevations ? simplifiedEle : undefined }
}

export function totalRouteKm(points: RoutePoint[]): number {
  return points.at(-1)?.distanceFromStart ?? 0
}

export function buildGradeSegments(
  points: RoutePoint[]
): { coordinates: [number, number][]; grade: number }[] {
  const segments: { coordinates: [number, number][]; grade: number }[] = []

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!
    const curr = points[i]!
    if (prev.elevation == null || curr.elevation == null) continue

    const distM = haversineM(prev, curr)
    if (distM < 1) continue

    const grade = ((curr.elevation - prev.elevation) / distM) * 100
    segments.push({
      coordinates: [
        [prev.lng, prev.lat],
        [curr.lng, curr.lat],
      ],
      grade,
    })
  }

  return segments
}

export function gradeColor(grade: number): string {
  if (grade < 3) return '#22c55e'
  if (grade < 6) return '#eab308'
  if (grade < 10) return '#f97316'
  return '#ef4444'
}

export function buildElevationSamples(
  points: RoutePoint[],
  maxPoints = 400
): { km: number; elevation: number }[] {
  const samples = points.filter(
    (p) => p.elevation != null && p.distanceFromStart != null
  )
  if (!samples.length) return []

  if (samples.length <= maxPoints) {
    return samples.map((p) => ({
      km: p.distanceFromStart!,
      elevation: p.elevation!,
    }))
  }

  const step = Math.ceil(samples.length / maxPoints)
  return samples
    .filter((_, i) => i % step === 0 || i === samples.length - 1)
    .map((p) => ({
      km: p.distanceFromStart!,
      elevation: p.elevation!,
    }))
}

export function hasElevationData(points: RoutePoint[]): boolean {
  const samples = buildElevationSamples(points, 200)
  if (samples.length < 2) return false
  const elevations = samples.map((s) => s.elevation)
  return Math.max(...elevations) - Math.min(...elevations) > 1
}

export function buildKmMarkers(
  points: RoutePoint[],
  intervalKm: number
): { km: number; lat: number; lng: number }[] {
  const totalKm = totalRouteKm(points)
  if (totalKm <= 0) return []

  const markers: { km: number; lat: number; lng: number }[] = []

  for (let km = intervalKm; km < totalKm; km += intervalKm) {
    const pt = interpolateAtKm(points, km)
    if (pt) markers.push({ km, lat: pt.lat, lng: pt.lng })
  }

  return markers
}

function interpolateAtKm(
  points: RoutePoint[],
  targetKm: number
): RoutePoint | null {
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!
    const curr = points[i]!
    const prevKm = prev.distanceFromStart ?? 0
    const currKm = curr.distanceFromStart ?? 0
    if (currKm >= targetKm) {
      const t = (targetKm - prevKm) / (currKm - prevKm || 1)
      const prevElev = prev.elevation
      const currElev = curr.elevation
      const elevation =
        prevElev != null && currElev != null
          ? prevElev + t * (currElev - prevElev)
          : prevElev ?? currElev
      return {
        lat: prev.lat + t * (curr.lat - prev.lat),
        lng: prev.lng + t * (curr.lng - prev.lng),
        elevation,
        distanceFromStart: targetKm,
      }
    }
  }
  return points.at(-1) ?? null
}

export function pointAtRouteKm(
  points: RoutePoint[],
  targetKm: number
): RoutePoint | null {
  if (!points.length) return null
  const total = totalRouteKm(points)
  const km = Math.max(0, Math.min(targetKm, total))
  return interpolateAtKm(points, km)
}

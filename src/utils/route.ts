import type { RoutePoint } from '../../shared/types'
import { haversineM } from '../services/geo'
import { gradeToColor } from '../config/mapStyle'

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
): { coordinates: [number, number][]; grade: number; color: string }[] {
  if (!hasElevationData(points)) return []

  type Seg = { coordinates: [number, number][]; grade: number; color: string }
  const raw: Seg[] = []

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!
    const curr = points[i]!
    if (prev.elevation == null || curr.elevation == null) continue

    const distM = haversineM(prev, curr)
    if (distM < 1) continue

    const grade = ((curr.elevation - prev.elevation) / distM) * 100
    raw.push({
      coordinates: [
        [prev.lng, prev.lat],
        [curr.lng, curr.lat],
      ],
      grade,
      color: gradeToColor(grade),
    })
  }

  // Merge consecutive segments with same color bucket → fewer map features
  const merged: Seg[] = []
  for (const seg of raw) {
    const last = merged.at(-1)
    if (last && last.color === seg.color) {
      last.coordinates.push(seg.coordinates[1]!)
      // keep max |grade| for tooltip-ish accuracy
      if (Math.abs(seg.grade) > Math.abs(last.grade)) last.grade = seg.grade
    } else {
      merged.push({
        coordinates: [...seg.coordinates],
        grade: seg.grade,
        color: seg.color,
      })
    }
  }

  return merged
}

export function gradeColor(grade: number): string {
  return gradeToColor(grade)
}

export interface Climb {
  startKm: number
  endKm: number
  gainM: number
  lengthKm: number
  avgGrade: number
  /** Summit position */
  lat: number
  lng: number
  elevM: number
}

/**
 * Detect meaningful climbs from elevation profile.
 * Uses hysteresis so small dips don't split one long climb.
 */
export function detectClimbs(points: RoutePoint[]): Climb[] {
  if (!hasElevationData(points) || points.length < 3) return []

  const MIN_GAIN_M = 70
  const MIN_LENGTH_KM = 0.6
  const END_DESCENT_M = 30
  const MAX_CLIMBS = 14
  const MIN_SPACING_KM = 2.5

  type Active = {
    startIdx: number
    peakIdx: number
    peakElev: number
  }

  const climbs: Climb[] = []
  let active: Active | null = null

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!
    const curr = points[i]!
    if (prev.elevation == null || curr.elevation == null) continue

    const elev = curr.elevation
    const dElev = elev - prev.elevation

    if (!active) {
      if (dElev > 0.5) {
        active = { startIdx: i - 1, peakIdx: i, peakElev: elev }
      }
      continue
    }

    if (elev >= active.peakElev) {
      active.peakIdx = i
      active.peakElev = elev
    }

    const dropFromPeak = active.peakElev - elev
    const atEnd = i === points.length - 1

    if (dropFromPeak >= END_DESCENT_M || atEnd) {
      const start = points[active.startIdx]!
      const peak = points[active.peakIdx]!
      if (start.elevation != null && peak.elevation != null) {
        const gainM = peak.elevation - start.elevation
        const lengthKm =
          (peak.distanceFromStart ?? 0) - (start.distanceFromStart ?? 0)
        if (gainM >= MIN_GAIN_M && lengthKm >= MIN_LENGTH_KM) {
          climbs.push({
            startKm: start.distanceFromStart ?? 0,
            endKm: peak.distanceFromStart ?? 0,
            gainM,
            lengthKm,
            avgGrade: lengthKm > 0 ? (gainM / (lengthKm * 1000)) * 100 : 0,
            lat: peak.lat,
            lng: peak.lng,
            elevM: peak.elevation,
          })
        }
      }
      active = null
      // If still climbing after a dip, new climb may start on next rising segment
      if (!atEnd && dElev > 0.5) {
        active = { startIdx: i - 1, peakIdx: i, peakElev: elev }
      }
    }
  }

  // Prefer biggest climbs; avoid markers stacked too close
  climbs.sort((a, b) => b.gainM - a.gainM)
  const spaced: Climb[] = []
  for (const c of climbs) {
    if (spaced.length >= MAX_CLIMBS) break
    const tooClose = spaced.some(
      (s) => Math.abs(s.endKm - c.endKm) < MIN_SPACING_KM
    )
    if (!tooClose) spaced.push(c)
  }

  return spaced.sort((a, b) => a.startKm - b.startKm)
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
      let gradient: number | undefined = curr.gradient
      if (gradient == null && prevElev != null && currElev != null) {
        const distM = haversineM(prev, curr)
        if (distM > 1) gradient = ((currElev - prevElev) / distM) * 100
      }
      return {
        lat: prev.lat + t * (curr.lat - prev.lat),
        lng: prev.lng + t * (curr.lng - prev.lng),
        elevation,
        distanceFromStart: targetKm,
        gradient,
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

export interface ElevationSegmentStats {
  startKm: number
  endKm: number
  lengthKm: number
  startElev: number
  endElev: number
  ascentM: number
  descentM: number
  netGainM: number
  avgGradePct: number
}

/** Stats for a km range on the elevation profile (drag selection). */
export function analyzeElevationSegment(
  points: RoutePoint[],
  startKm: number,
  endKm: number
): ElevationSegmentStats | null {
  if (!hasElevationData(points)) return null

  const lo = Math.min(startKm, endKm)
  const hi = Math.max(startKm, endKm)
  if (hi - lo < 0.05) return null

  const start = pointAtRouteKm(points, lo)
  const end = pointAtRouteKm(points, hi)
  if (start?.elevation == null || end?.elevation == null) return null

  const lengthKm = hi - lo
  let ascentM = 0
  let descentM = 0
  let prevElev: number | null = null

  for (const p of points) {
    const km = p.distanceFromStart ?? 0
    if (km < lo) {
      if (p.elevation != null) prevElev = p.elevation
      continue
    }
    if (km > hi) break
    if (p.elevation == null) continue
    if (prevElev != null) {
      const diff = p.elevation - prevElev
      if (diff > 0) ascentM += diff
      else descentM -= diff
    }
    prevElev = p.elevation
  }

  const netGainM = end.elevation - start.elevation
  const lengthM = lengthKm * 1000
  let avgGradePct = 0
  if (lengthM > 0) {
    if (descentM > ascentM * 1.2) {
      avgGradePct = -(descentM / lengthM) * 100
    } else if (ascentM > descentM * 1.2) {
      avgGradePct = (ascentM / lengthM) * 100
    } else {
      avgGradePct = (netGainM / lengthM) * 100
    }
  }

  return {
    startKm: lo,
    endKm: hi,
    lengthKm,
    startElev: start.elevation,
    endElev: end.elevation,
    ascentM,
    descentM,
    netGainM,
    avgGradePct,
  }
}

import type { RoutePoint } from '../../shared/types'
import { haversineM } from '../services/geo'
import { gradeToColor } from '../config/mapStyle'

/** Emergency cap only — normal GPX tracks are kept 1:1 (no geometry rewrite). */
export const ROUTE_SIMPLIFY_MAX_POINTS = 250_000
/** Only used if a track exceeds ROUTE_SIMPLIFY_MAX_POINTS (pathological files). */
export const ROUTE_SIMPLIFY_EPSILON_M = 1

function isFiniteLngLat(lng: unknown, lat: unknown): boolean {
  return typeof lng === 'number' && typeof lat === 'number' && Number.isFinite(lng) && Number.isFinite(lat)
}

function finiteElev(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

/** Drop null/NaN vertices before MapLibre setData / charts. */
export function sanitizeRouteCoords(coordinates: [number, number][]): [number, number][] {
  const out: [number, number][] = []
  for (const c of coordinates) {
    if (!c || c.length < 2) continue
    const lng = c[0]
    const lat = c[1]
    if (isFiniteLngLat(lng, lat)) out.push([lng as number, lat as number])
  }
  return out
}

/** Normalize shared/GPX points so elevation/coords never pass null into MapLibre. */
export function sanitizeRoutePoints(points: RoutePoint[]): RoutePoint[] {
  const out: RoutePoint[] = []
  for (const p of points) {
    if (!isFiniteLngLat(p.lng, p.lat)) continue
    const elevation = finiteElev(p.elevation)
    const distanceFromStart =
      typeof p.distanceFromStart === 'number' && Number.isFinite(p.distanceFromStart)
        ? p.distanceFromStart
        : undefined
    const gradient =
      typeof p.gradient === 'number' && Number.isFinite(p.gradient) ? p.gradient : undefined
    out.push({
      lat: p.lat,
      lng: p.lng,
      ...(elevation != null ? { elevation } : {}),
      ...(distanceFromStart != null ? { distanceFromStart } : {}),
      ...(gradient != null ? { gradient } : {}),
    })
  }
  return out
}

export function buildRoutePoints(
  coordinates: [number, number][],
  elevations?: number[]
): RoutePoint[] {
  const cleanedCoords: [number, number][] = []
  const cleanedEle: number[] | undefined = elevations?.length ? [] : undefined

  for (let i = 0; i < coordinates.length; i++) {
    const pair = coordinates[i]
    if (!pair || !isFiniteLngLat(pair[0], pair[1])) continue
    cleanedCoords.push([pair[0] as number, pair[1] as number])
    if (cleanedEle && elevations) {
      const e = finiteElev(elevations[i])
      cleanedEle.push(e ?? 0)
    }
  }

  // If caller passed elevations but none were finite, omit elevation entirely.
  const useEle =
    cleanedEle &&
    elevations &&
    elevations.some((e) => finiteElev(e) != null)
      ? cleanedEle
      : undefined

  const simplified = simplifyRouteGeometry(cleanedCoords, useEle)
  const points: RoutePoint[] = []
  let totalM = 0

  for (let i = 0; i < simplified.coords.length; i++) {
    const [lng, lat] = simplified.coords[i]!
    if (i > 0) {
      const prev = simplified.coords[i - 1]!
      totalM += haversineM({ lat: prev[1], lng: prev[0] }, { lat, lng })
    }

    let gradient: number | undefined
    const elev = finiteElev(simplified.elevations?.[i])
    if (i > 0 && simplified.elevations) {
      const prevEle = finiteElev(simplified.elevations[i - 1])
      const currEle = elev
      const prev = simplified.coords[i - 1]!
      const distM = haversineM({ lat: prev[1], lng: prev[0] }, { lat, lng })
      if (distM > 1 && prevEle != null && currEle != null) {
        gradient = ((currEle - prevEle) / distM) * 100
      }
    }

    points.push({
      lat,
      lng,
      ...(elev != null ? { elevation: elev } : {}),
      distanceFromStart: totalM / 1000,
      ...(gradient != null ? { gradient } : {}),
    })
  }

  return points
}

/** Perpendicular distance of P to segment AB, local meters (equirectangular). */
function pointToSegmentDistanceM(
  p: [number, number],
  a: [number, number],
  b: [number, number]
): number {
  const lat0 = (((a[1] + b[1]) / 2) * Math.PI) / 180
  const cosLat = Math.cos(lat0)
  const ax = a[0] * cosLat
  const ay = a[1]
  const bx = b[0] * cosLat
  const by = b[1]
  const px = p[0] * cosLat
  const py = p[1]
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  let t = 0
  if (len2 > 0) {
    t = ((px - ax) * dx + (py - ay) * dy) / len2
    t = Math.max(0, Math.min(1, t))
  }
  const qx = ax + t * dx
  const qy = ay + t * dy
  // degrees → meters (~111320 m per degree lat)
  const mPerDeg = 111_320
  const dEast = (px - qx) * mPerDeg
  const dNorth = (py - qy) * mPerDeg
  return Math.hypot(dEast, dNorth)
}

/**
 * Keep GPX geometry verbatim. Douglas–Peucker runs only if the track exceeds
 * maxPoints (browser safety) — race courses must not be rewritten for display.
 */
export function simplifyRouteGeometry(
  coords: [number, number][],
  elevations?: number[],
  maxPoints = ROUTE_SIMPLIFY_MAX_POINTS,
  epsilonM = ROUTE_SIMPLIFY_EPSILON_M
): { coords: [number, number][]; elevations?: number[] } {
  if (coords.length <= 2 || coords.length <= maxPoints) {
    return { coords, elevations }
  }

  let eps = Math.max(0.5, epsilonM)
  let keep = douglasPeuckerKeep(coords, eps)

  while (keep.length > maxPoints && eps < 80) {
    eps *= 1.6
    keep = douglasPeuckerKeep(coords, eps)
  }

  if (keep.length > maxPoints) {
    const step = Math.ceil(keep.length / maxPoints)
    const thinned: number[] = [keep[0]!]
    for (let i = step; i < keep.length - 1; i += step) thinned.push(keep[i]!)
    thinned.push(keep[keep.length - 1]!)
    keep = thinned
  }

  const outCoords = keep.map((i) => coords[i]!)
  const outEle = elevations ? keep.map((i) => finiteElev(elevations[i]) ?? 0) : undefined
  return { coords: outCoords, elevations: outEle }
}

function douglasPeuckerKeep(coords: [number, number][], epsilonM: number): number[] {
  const n = coords.length
  if (n <= 2) return Array.from({ length: n }, (_, i) => i)

  const keep = new Uint8Array(n)
  keep[0] = 1
  keep[n - 1] = 1

  const stack: Array<[number, number]> = [[0, n - 1]]
  while (stack.length) {
    const [start, end] = stack.pop()!
    if (end <= start + 1) continue
    const a = coords[start]!
    const b = coords[end]!
    let maxDist = 0
    let maxIdx = start
    for (let i = start + 1; i < end; i++) {
      const d = pointToSegmentDistanceM(coords[i]!, a, b)
      if (d > maxDist) {
        maxDist = d
        maxIdx = i
      }
    }
    if (maxDist > epsilonM) {
      keep[maxIdx] = 1
      stack.push([start, maxIdx], [maxIdx, end])
    }
  }

  const indices: number[] = []
  for (let i = 0; i < n; i++) {
    if (keep[i]) indices.push(i)
  }
  return indices
}

/** Display / cache polyline — full GPX fidelity (same as route points). */
export function simplifyCoords(
  coords: [number, number][],
  maxPoints = ROUTE_SIMPLIFY_MAX_POINTS
): [number, number][] {
  return simplifyRouteGeometry(coords, undefined, maxPoints).coords
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
    (p) =>
      typeof p.elevation === 'number' &&
      Number.isFinite(p.elevation) &&
      typeof p.distanceFromStart === 'number' &&
      Number.isFinite(p.distanceFromStart)
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

/**
 * DEM/GPS elevation noise filter (Strava-like).
 * ORS returns DEM-sampled Z; raw positive deltas inflate gain badly.
 * Light moving-average + ignore sub-threshold wiggles; real climbs still accumulate.
 */
const ELEV_SMOOTH_WINDOW = 5
/** Meters — typical consumer apps use ~3 m after smoothing. */
const ELEV_NOISE_THRESHOLD_M = 3

export function smoothElevations(
  elevations: number[],
  window = ELEV_SMOOTH_WINDOW
): number[] {
  if (elevations.length < 3 || window < 3) return elevations.slice()
  const half = Math.floor(window / 2)
  const out: number[] = new Array(elevations.length)
  for (let i = 0; i < elevations.length; i++) {
    let sum = 0
    let n = 0
    const lo = Math.max(0, i - half)
    const hi = Math.min(elevations.length - 1, i + half)
    for (let j = lo; j <= hi; j++) {
      sum += elevations[j]!
      n++
    }
    out[i] = sum / n
  }
  return out
}

/**
 * Cumulative ascent/descent with smoothing + minimum rise/fall threshold.
 * Continuous climbs still count in full (threshold advances the baseline).
 */
export function elevationGainLoss(
  elevations: number[],
  opts?: { thresholdM?: number; smoothWindow?: number }
): { ascentM: number; descentM: number } {
  const threshold = opts?.thresholdM ?? ELEV_NOISE_THRESHOLD_M
  const window = opts?.smoothWindow ?? ELEV_SMOOTH_WINDOW
  if (elevations.length < 2) return { ascentM: 0, descentM: 0 }

  const smoothed = smoothElevations(elevations, window)
  let ascentM = 0
  let descentM = 0
  let last = smoothed[0]!

  for (let i = 1; i < smoothed.length; i++) {
    const elev = smoothed[i]!
    const diff = elev - last
    if (diff >= threshold) {
      ascentM += diff
      last = elev
    } else if (diff <= -threshold) {
      descentM += -diff
      last = elev
    }
  }

  return { ascentM, descentM }
}

export function routeElevationGainLoss(
  points: RoutePoint[]
): { ascentM: number; descentM: number } {
  const elevations: number[] = []
  for (const p of points) {
    if (p.elevation != null && Number.isFinite(p.elevation)) {
      elevations.push(p.elevation)
    }
  }
  return elevationGainLoss(elevations)
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
  const segmentElevs: number[] = []
  if (start.elevation != null) segmentElevs.push(start.elevation)
  for (const p of points) {
    const km = p.distanceFromStart ?? 0
    if (km <= lo || km >= hi) continue
    if (p.elevation == null || !Number.isFinite(p.elevation)) continue
    segmentElevs.push(p.elevation)
  }
  if (end.elevation != null) segmentElevs.push(end.elevation)
  const { ascentM, descentM } = elevationGainLoss(segmentElevs)

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

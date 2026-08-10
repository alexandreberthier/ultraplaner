import type {
  RouteSurfaceBucket,
  RouteSurfaceBucketId,
  RouteSurfaceSegment,
  RouteSurfaceSummary,
} from '../../shared/types'

/**
 * ORS surface IDs → rider buckets.
 * @see https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/extra-info/surface
 */
const SURFACE_TO_BUCKET: Record<number, RouteSurfaceBucketId> = {
  0: 'unknown',
  1: 'asphalt', // Paved
  2: 'unpaved',
  3: 'asphalt',
  4: 'asphalt', // Concrete
  5: 'cobble',
  6: 'asphalt', // Metal
  7: 'asphalt', // Wood
  8: 'gravel',
  9: 'gravel',
  10: 'gravel',
  11: 'unpaved',
  12: 'unpaved',
  13: 'unpaved', // Ice
  14: 'cobble', // Paving stones
  15: 'unpaved',
  16: 'unpaved',
  17: 'unpaved',
  18: 'unpaved', // Grass paver
}

const BUCKET_ORDER: RouteSurfaceBucketId[] = [
  'asphalt',
  'cobble',
  'gravel',
  'unpaved',
  'unknown',
]

/** Shared map + elevation colors for surface buckets. */
export const SURFACE_COLORS: Record<RouteSurfaceBucketId, string> = {
  asphalt: '#1f2937',
  cobble: '#c2410c',
  gravel: '#ca8a04',
  unpaved: '#92400e',
  unknown: '#9ca3af',
}

export const SURFACE_I18N_KEYS: Record<RouteSurfaceBucketId, string> = {
  asphalt: 'elevation.surfaceAsphalt',
  cobble: 'elevation.surfaceCobble',
  gravel: 'elevation.surfaceGravel',
  unpaved: 'elevation.surfaceUnpaved',
  unknown: 'elevation.surfaceUnknown',
}

export type OrsSurfaceSummaryRow = {
  value: number
  distance: number
  amount: number
}

/** ORS extras.surface.values row: [fromIdx, toIdx, surfaceId] */
export type OrsSurfaceValueRow = [number, number, number]

export function orsSurfaceIdToBucket(value: number): RouteSurfaceBucketId {
  return SURFACE_TO_BUCKET[value] ?? 'unknown'
}

/** Merge adjacent same-bucket index ranges (fewer map features). */
export function mergeSurfaceSegments(
  segments: RouteSurfaceSegment[]
): RouteSurfaceSegment[] {
  if (!segments.length) return []
  const out: RouteSurfaceSegment[] = []
  for (const seg of segments) {
    if (seg.endIdx <= seg.startIdx) continue
    const last = out.at(-1)
    if (last && last.id === seg.id && last.endIdx === seg.startIdx) {
      last.endIdx = seg.endIdx
    } else {
      out.push({ ...seg })
    }
  }
  return out
}

/**
 * Parse ORS surface values into rider buckets, merging consecutive identical buckets.
 * Indices refer to the route LineString coordinates.
 */
export function parseOrsSurfaceValues(
  values: OrsSurfaceValueRow[] | undefined | null
): RouteSurfaceSegment[] {
  if (!values?.length) return []

  const raw: RouteSurfaceSegment[] = []
  for (const row of values) {
    if (!Array.isArray(row) || row.length < 3) continue
    const startIdx = row[0]
    const endIdx = row[1]
    const surfaceId = row[2]
    if (
      !Number.isFinite(startIdx) ||
      !Number.isFinite(endIdx) ||
      !Number.isFinite(surfaceId)
    ) {
      continue
    }
    const from = Math.max(0, Math.floor(startIdx))
    const to = Math.floor(endIdx)
    if (to <= from) continue
    raw.push({
      startIdx: from,
      endIdx: to,
      id: orsSurfaceIdToBucket(surfaceId),
    })
  }

  return mergeSurfaceSegments(raw)
}

/** Aggregate ORS surface summary rows into rider buckets (sorted by %). */
export function bucketOrsSurfaceSummary(
  rows: OrsSurfaceSummaryRow[] | undefined | null,
  segments?: RouteSurfaceSegment[] | null
): RouteSurfaceSummary | null {
  if (!rows?.length) {
    if (segments?.length) {
      return { buckets: [], totalKm: 0, segments }
    }
    return null
  }

  const distM: Record<RouteSurfaceBucketId, number> = {
    asphalt: 0,
    cobble: 0,
    gravel: 0,
    unpaved: 0,
    unknown: 0,
  }

  let totalM = 0
  for (const row of rows) {
    if (!Number.isFinite(row.distance) || row.distance <= 0) continue
    const bucket = SURFACE_TO_BUCKET[row.value] ?? 'unknown'
    distM[bucket] += row.distance
    totalM += row.distance
  }

  if (totalM <= 0) {
    return segments?.length ? { buckets: [], totalKm: 0, segments } : null
  }

  const totalKm = totalM / 1000
  const buckets: RouteSurfaceBucket[] = []

  for (const id of BUCKET_ORDER) {
    const m = distM[id]
    if (m <= 0) continue
    buckets.push({
      id,
      km: Math.round((m / 1000) * 100) / 100,
      percent: Math.round((m / totalM) * 1000) / 10,
    })
  }

  // Fix rounding so percents sum ~100
  if (buckets.length) {
    const sum = buckets.reduce((s, b) => s + b.percent, 0)
    const delta = Math.round((100 - sum) * 10) / 10
    if (delta !== 0) {
      const largest = buckets.reduce((a, b) => (b.percent >= a.percent ? b : a))
      largest.percent = Math.round((largest.percent + delta) * 10) / 10
    }
  }

  buckets.sort((a, b) => b.percent - a.percent)
  return {
    buckets,
    totalKm: Math.round(totalKm * 100) / 100,
    ...(segments?.length ? { segments } : {}),
  }
}

export type SurfaceLineFeature = {
  coordinates: [number, number][]
  bucket: RouteSurfaceBucketId
  color: string
}

/** Build LineString features from ORS index ranges (merged by bucket). */
export function buildSurfaceLineFeatures(
  coords: [number, number][],
  segments: RouteSurfaceSegment[] | undefined | null
): SurfaceLineFeature[] {
  if (!coords.length || !segments?.length) return []

  const last = coords.length - 1
  const features: SurfaceLineFeature[] = []

  for (const seg of segments) {
    const from = Math.max(0, Math.min(seg.startIdx, last))
    const to = Math.max(0, Math.min(seg.endIdx, last))
    if (to <= from) continue
    const slice = coords.slice(from, to + 1)
    if (slice.length < 2) continue
    features.push({
      coordinates: slice,
      bucket: seg.id,
      color: SURFACE_COLORS[seg.id],
    })
  }

  return features
}

/**
 * Ordered percent shares along the route (for the compact bar).
 * Falls back to summary buckets (mix-only) when no segments.
 */
export function surfaceBarShares(
  summary: RouteSurfaceSummary | null | undefined
): { id: RouteSurfaceBucketId; percent: number }[] {
  if (!summary) return []
  const segs = summary.segments
  if (!segs?.length) {
    return summary.buckets.map((b) => ({ id: b.id, percent: b.percent }))
  }

  // Approximate equal weight per index span (good enough for a thin legend bar)
  let total = 0
  const spans: { id: RouteSurfaceBucketId; span: number }[] = []
  for (const s of segs) {
    const span = Math.max(0, s.endIdx - s.startIdx)
    if (span <= 0) continue
    spans.push({ id: s.id, span })
    total += span
  }
  if (total <= 0) {
    return summary.buckets.map((b) => ({ id: b.id, percent: b.percent }))
  }

  // Merge consecutive same id for fewer bar chips
  const merged: { id: RouteSurfaceBucketId; span: number }[] = []
  for (const s of spans) {
    const last = merged.at(-1)
    if (last && last.id === s.id) last.span += s.span
    else merged.push({ ...s })
  }

  return merged.map((s) => ({
    id: s.id,
    percent: Math.round((s.span / total) * 1000) / 10,
  }))
}

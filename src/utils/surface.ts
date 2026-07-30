import type {
  RouteSurfaceBucket,
  RouteSurfaceBucketId,
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

export type OrsSurfaceSummaryRow = {
  value: number
  distance: number
  amount: number
}

/** Aggregate ORS surface summary rows into rider buckets (sorted by %). */
export function bucketOrsSurfaceSummary(
  rows: OrsSurfaceSummaryRow[] | undefined | null
): RouteSurfaceSummary | null {
  if (!rows?.length) return null

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

  if (totalM <= 0) return null

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
  return { buckets, totalKm: Math.round(totalKm * 100) / 100 }
}

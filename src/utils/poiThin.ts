import type { Poi, PoiCategory } from '../../shared/types'
import { haversineM } from '../services/geo'

const MAP_SPACING_KM: Partial<Record<PoiCategory, number>> = {
  fuel: 5,
  supermarket: 2,
  gastronomy: 4,
  water: 2,
  beverages: 3,
  hotel: 10,
  bike: 10,
  campsite: 15,
}

const DEFAULT_SPACING_KM = 1.5

/** Min distance between same-category markers on a nearby (no-route) map. */
const NEARBY_SPACING_M: Partial<Record<PoiCategory, number>> = {
  fuel: 800,
  supermarket: 550,
  water: 500,
  gastronomy: 700,
  beverages: 700,
  hotel: 1200,
  bike: 1000,
  campsite: 1500,
}

const DEFAULT_NEARBY_SPACING_M = 600

export function thinPoisForMap(pois: Poi[]): Poi[] {
  const byCategory = new Map<PoiCategory, Poi[]>()

  for (const poi of pois) {
    const list = byCategory.get(poi.category) ?? []
    list.push(poi)
    byCategory.set(poi.category, list)
  }

  const result: Poi[] = []

  for (const [category, catPois] of byCategory) {
    const spacing = MAP_SPACING_KM[category] ?? DEFAULT_SPACING_KM
    const sorted = [...catPois].sort((a, b) => {
      const kmDiff = (a.distanceAlongRouteKm ?? 0) - (b.distanceAlongRouteKm ?? 0)
      if (kmDiff !== 0) return kmDiff
      return (a.distanceToRouteM ?? Infinity) - (b.distanceToRouteM ?? Infinity)
    })

    let lastKm = -Infinity
    for (const poi of sorted) {
      const km = poi.distanceAlongRouteKm ?? 0
      if (km - lastKm >= spacing) {
        result.push(poi)
        lastKm = km
      }
    }
  }

  return result.sort(
    (a, b) => (a.distanceAlongRouteKm ?? 0) - (b.distanceAlongRouteKm ?? 0)
  )
}

/** Greedy spatial thin for Ride/nearby: keep closest first, drop same-category neighbors. */
export function thinPoisByProximity(pois: Poi[], alwaysKeepIds?: Set<string>): Poi[] {
  const keptByCat = new Map<PoiCategory, Poi[]>()
  const kept = new Set<string>()
  const result: Poi[] = []

  const sorted = [...pois].sort(
    (a, b) => (a.distanceToRouteM ?? Infinity) - (b.distanceToRouteM ?? Infinity)
  )

  const take = (poi: Poi) => {
    if (kept.has(poi.id)) return
    result.push(poi)
    kept.add(poi.id)
    const list = keptByCat.get(poi.category) ?? []
    list.push(poi)
    keptByCat.set(poi.category, list)
  }

  if (alwaysKeepIds?.size) {
    for (const poi of sorted) {
      if (alwaysKeepIds.has(poi.id)) take(poi)
    }
  }

  for (const poi of sorted) {
    if (kept.has(poi.id)) continue
    const spacing = NEARBY_SPACING_M[poi.category] ?? DEFAULT_NEARBY_SPACING_M
    const peers = keptByCat.get(poi.category) ?? []
    if (peers.some((p) => haversineM(poi, p) < spacing)) continue
    take(poi)
  }

  return result.sort(
    (a, b) => (a.distanceToRouteM ?? 0) - (b.distanceToRouteM ?? 0)
  )
}

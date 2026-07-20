import type { Poi, PoiCategory } from '../../shared/types'

const MAP_SPACING_KM: Partial<Record<PoiCategory, number>> = {
  fuel: 5,
  food: 2,
  water: 2,
  restaurant: 5,
  hotel: 10,
  bike: 10,
  campsite: 15,
}

const DEFAULT_SPACING_KM = 1.5

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

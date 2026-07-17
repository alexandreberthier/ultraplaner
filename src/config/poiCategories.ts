import type { PoiCategory } from '../../shared/types'

export interface PoiCategoryDef {
  id: PoiCategory
  label: string
  icon: string
  defaultOn: boolean
}

export const POI_CATEGORY_DEFS: PoiCategoryDef[] = [
  { id: 'fuel', label: 'Tankstellen', icon: '⛽', defaultOn: true },
  { id: 'food', label: 'Essen', icon: '🛒', defaultOn: true },
  { id: 'water', label: 'Wasser', icon: '💧', defaultOn: true },
  { id: 'kiosk', label: 'Kiosk', icon: '🏪', defaultOn: false },
  { id: 'vending', label: 'Automat', icon: '🥤', defaultOn: false },
  { id: 'toilets', label: 'Toilette', icon: '🚻', defaultOn: false },
  { id: 'restaurant', label: 'Restaurant', icon: '🍽️', defaultOn: false },
  { id: 'alpine_hut', label: 'Berghütte', icon: '🏔️', defaultOn: false },
  { id: 'bike', label: 'Rad', icon: '🔧', defaultOn: false },
  { id: 'hotel', label: 'Hotel', icon: '🏨', defaultOn: false },
  { id: 'campsite', label: 'Camping', icon: '⛺', defaultOn: false },
  { id: 'shelter', label: 'Unterstand', icon: '🛖', defaultOn: false },
]

export const DEFAULT_POI_CATEGORIES = POI_CATEGORY_DEFS.filter((c) => c.defaultOn).map(
  (c) => c.id
)

export const DEFAULT_POI_RADIUS_M = 500
export const MIN_POI_RADIUS_M = 300
export const MAX_POI_RADIUS_M = 2000
export const MAX_GPX_SIZE_BYTES = 25 * 1024 * 1024
export const MAX_ROUTE_KM = 2000

export const DACH_BBOX = {
  south: 45.8,
  north: 55.2,
  west: 5.8,
  east: 17.2,
}

export const DACH_MIN_POINTS_RATIO = 0.8

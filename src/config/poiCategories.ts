import type { PoiCategory } from '../../shared/types'
import { IMPORT_REGIONS } from '../../shared/regions'

export {
  IMPORT_REGIONS,
  IMPORT_REGION_CODES as SUPPORTED_REGION_CODES,
  SUPPORTED_REGIONS_LABEL,
  GEOCODE_BBOX,
} from '../../shared/regions'

export interface PoiCategoryDef {
  id: PoiCategory
  label: string
  icon: string
  defaultOn: boolean
}

export const POI_CATEGORY_DEFS: PoiCategoryDef[] = [
  { id: 'fuel', label: 'Tankstellen', icon: '⛽', defaultOn: true },
  { id: 'supermarket', label: 'Supermärkte', icon: '🛒', defaultOn: true },
  { id: 'water', label: 'Trinkwasser', icon: '💧', defaultOn: true },
  { id: 'gastronomy', label: 'Gastronomie', icon: '🍴', defaultOn: false },
  { id: 'beverages', label: 'Getränke', icon: '🍾', defaultOn: false },
  { id: 'bike', label: 'Rad', icon: '🔧', defaultOn: false },
  { id: 'hotel', label: 'Hotel', icon: '🏨', defaultOn: false },
  { id: 'campsite', label: 'Camping', icon: '⛺', defaultOn: false },
]

export const DEFAULT_POI_CATEGORIES = POI_CATEGORY_DEFS.filter((c) => c.defaultOn).map(
  (c) => c.id
)

/** Nearby (Umgebung) defaults — independent of corridor-along-route defaults. */
export const NEARBY_DEFAULT_POI_CATEGORIES: PoiCategory[] = [
  'fuel',
  'supermarket',
  'water',
]

export const DEFAULT_POI_RADIUS_M = 500
export const MIN_POI_RADIUS_M = 300
export const MAX_POI_RADIUS_M = 2000
/** Nearby search can look farther than corridor-along-route. */
export const NEARBY_DEFAULT_POI_RADIUS_M = 5000
export const NEARBY_MAX_POI_RADIUS_M = 10000
export const MAX_GPX_SIZE_BYTES = 25 * 1024 * 1024
export const MAX_ROUTE_KM = 2000

/** Union der importierten Geofabrik-Regionen. */
export const SUPPORTED_REGION_BBOXES = IMPORT_REGIONS.map((r) => ({
  code: r.code,
  south: r.south,
  west: r.west,
  north: r.north,
  east: r.east,
}))

export const SUPPORTED_REGION_MIN_POINTS_RATIO = 0.8

/** @deprecated use SUPPORTED_REGION_BBOXES */
export const DACH_BBOX = {
  south: 35.9,
  north: 57.8,
  west: -9.5,
  east: 22.9,
}

/** @deprecated use SUPPORTED_REGION_MIN_POINTS_RATIO */
export const DACH_MIN_POINTS_RATIO = SUPPORTED_REGION_MIN_POINTS_RATIO

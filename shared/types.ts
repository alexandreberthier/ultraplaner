export type PoiCategory =
  | 'fuel'
  | 'supermarket'
  | 'gastronomy'
  | 'water'
  | 'beverages'
  | 'hotel'
  | 'campsite'
  | 'bike'
  /** User-placed race control / mandatory stop (not from OSM). */
  | 'checkpoint'
  | 'sleep'
  | 'border'

export type ControlPointKind = 'cp' | 'sleep' | 'border'

/** User-placed race markers (CP, sleep; border legacy) — export + Spickzettel. */
export interface ControlPoint {
  id: string
  kind: ControlPointKind
  name: string
  lat: number
  lng: number
  distanceAlongRouteKm?: number
  note?: string
}

export interface LatLng {
  lat: number
  lng: number
}

export interface RouteCursor {
  km: number
  lat: number
  lng: number
  elevation?: number
}

export interface RoutePoint extends LatLng {
  elevation?: number
  /** Cumulative distance along route in kilometres */
  distanceFromStart?: number
  gradient?: number
}

/** Rider-facing surface buckets (ORS surface extras aggregated). */
export type RouteSurfaceBucketId =
  | 'asphalt'
  | 'cobble'
  | 'gravel'
  | 'unpaved'
  | 'unknown'

export interface RouteSurfaceBucket {
  id: RouteSurfaceBucketId
  /** Share of route length, 0–100 */
  percent: number
  /** Distance in kilometres */
  km: number
}

/** Aggregated road-surface summary from ORS (drawn routes only). */
export interface RouteSurfaceSummary {
  buckets: RouteSurfaceBucket[]
  /** Total distance covered by surface extras (km) */
  totalKm: number
}

export interface Poi {
  id: string
  name: string
  category: PoiCategory
  lat: number
  lng: number
  subType?: string
  /** OSM opening_hours tag, e.g. "Mo-Fr 07:00-18:00; Sa 08:00-12:00" */
  openingHours?: string
  distanceToRouteM?: number
  distanceAlongRouteKm?: number
  distanceToFinishKm?: number
}

/** Personal labels for a starred POI (stored per saved map). */
export interface FavoriteMeta {
  customName?: string
  note?: string
}

export interface TileDocument {
  tileId: string
  poiCount: number
  pois: Poi[]
  updatedAt?: unknown
}

export interface SavedMapRecord {
  id: string
  name: string
  createdAt: unknown
  expiresAt: unknown
  routeCoords: [number, number][]
  routePoints: RoutePoint[]
  poiRadiusM: number
  categories: PoiCategory[]
  pois: Poi[]
  favorites: string[]
  /** Optional personal name/note per favorite POI id */
  favoriteMeta?: Record<string, FavoriteMeta>
  /** User-placed race control points (CP / sleep / border) */
  controlPoints?: ControlPoint[]
  /** ORS surface breakdown (drawn routes); absent for GPX imports */
  surfaceSummary?: RouteSurfaceSummary
}

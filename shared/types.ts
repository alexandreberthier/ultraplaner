export type PoiCategory =
  | 'fuel'
  | 'food'
  | 'restaurant'
  | 'water'
  | 'kiosk'
  | 'vending'
  | 'toilets'
  | 'hotel'
  | 'alpine_hut'
  | 'campsite'
  | 'shelter'
  | 'bike'

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
  distanceFromStart?: number
  gradient?: number
}

export interface Poi {
  id: string
  name: string
  category: PoiCategory
  lat: number
  lng: number
  subType?: string
  distanceToRouteM?: number
  distanceAlongRouteKm?: number
  distanceToFinishKm?: number
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
}

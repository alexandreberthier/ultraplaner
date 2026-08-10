import { gpx } from '@tmcw/togeojson'
import { DOMParser } from '@xmldom/xmldom'
import type { RoutePoint } from '../../shared/types'
import {
  MAX_GPX_SIZE_BYTES,
  MAX_ROUTE_KM,
  SUPPORTED_REGION_BBOXES,
  SUPPORTED_REGION_MIN_POINTS_RATIO,
  SUPPORTED_REGIONS_LABEL,
} from '../config/poiCategories'
import { isInBbox } from './geo'
import { buildRoutePoints, totalRouteKm } from '../utils/route'

export interface GpxWaypointImport {
  lat: number
  lng: number
  name: string
  favorite: boolean
  distanceFromStartM?: number
  category?: string
  osmId?: string
}

function extensionValue(
  wpt: {
    getElementsByTagName: (name: string) => ArrayLike<{
      localName?: string | null
      nodeName: string
      textContent: string | null
    }>
  },
  localName: string
): string | null {
  const nodes = wpt.getElementsByTagName('*')
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!
    const name = n.localName || n.nodeName
    if (name === localName || name === `up:${localName}` || name.endsWith(`:${localName}`)) {
      const text = n.textContent?.trim()
      return text || null
    }
  }
  return null
}

/** Parse UltraPlaner / generic waypoints from a GPX document. */
export function parseGpxWaypoints(text: string): GpxWaypointImport[] {
  const doc = new DOMParser().parseFromString(text, 'text/xml')
  const wpts = doc.getElementsByTagName('wpt')
  const out: GpxWaypointImport[] = []

  for (let i = 0; i < wpts.length; i++) {
    const wpt = wpts[i]!
    const lat = Number(wpt.getAttribute('lat'))
    const lng = Number(wpt.getAttribute('lon'))
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue

    const nameEl = wpt.getElementsByTagName('name')[0]
    const name = nameEl?.textContent?.trim() || 'Waypoint'
    const favRaw = extensionValue(wpt, 'favorite')
    const distRaw = extensionValue(wpt, 'distanceFromStart')
    const category = extensionValue(wpt, 'category') ?? undefined
    const osmId = extensionValue(wpt, 'osmId') ?? undefined
    const favorite =
      favRaw == null
        ? Boolean(osmId || category || distRaw)
        : /^(1|true|yes)$/i.test(favRaw)

    const distanceFromStartM =
      distRaw != null && Number.isFinite(Number(distRaw)) ? Number(distRaw) : undefined

    out.push({
      lat,
      lng,
      name,
      favorite,
      distanceFromStartM,
      category,
      osmId,
    })
  }

  return out
}

export function parseGpxFile(text: string): {
  coordinates: [number, number][]
  elevations: number[]
  name: string
  waypoints: GpxWaypointImport[]
} {
  const doc = new DOMParser().parseFromString(text, 'text/xml')
  const geojson = gpx(doc)

  const coordinates: [number, number][] = []
  const elevations: number[] = []
  let name = 'Importierte Route'

  const nameEl = doc.getElementsByTagName('name')[0]
  if (nameEl?.textContent) name = nameEl.textContent

  for (const feature of geojson.features) {
    if (feature.geometry.type === 'LineString') {
      for (const coord of feature.geometry.coordinates) {
        coordinates.push([coord[0], coord[1]])
        elevations.push(typeof coord[2] === 'number' && Number.isFinite(coord[2]) ? coord[2] : 0)
      }
    } else if (feature.geometry.type === 'MultiLineString') {
      for (const line of feature.geometry.coordinates) {
        for (const coord of line) {
          coordinates.push([coord[0], coord[1]])
          elevations.push(typeof coord[2] === 'number' && Number.isFinite(coord[2]) ? coord[2] : 0)
        }
      }
    }
  }

  if (coordinates.length < 2) {
    throw new Error('GPX enthält keine gültige Strecke')
  }

  return {
    coordinates,
    elevations,
    name,
    waypoints: parseGpxWaypoints(text),
  }
}

export function validateGpxFile(file: File, text: string): void {
  if (file.size > MAX_GPX_SIZE_BYTES) {
    throw new Error(`GPX-Datei zu groß (max. ${Math.round(MAX_GPX_SIZE_BYTES / 1024 / 1024)} MB)`)
  }

  const { coordinates } = parseGpxFile(text)
  const points = buildRoutePoints(coordinates)
  const km = totalRouteKm(points)

  if (km > MAX_ROUTE_KM) {
    throw new Error(`Route zu lang (max. ${MAX_ROUTE_KM} km, ist ${Math.round(km)} km)`)
  }
}

function isInSupportedRegion(lat: number, lng: number): boolean {
  return SUPPORTED_REGION_BBOXES.some((bbox) => isInBbox(lat, lng, bbox))
}

export function validateSupportedRoute(coordinates: [number, number][]): void {
  const inRegion = coordinates.filter(([lng, lat]) => isInSupportedRegion(lat, lng))
  const ratio = inRegion.length / coordinates.length

  if (ratio < SUPPORTED_REGION_MIN_POINTS_RATIO) {
    throw new Error(
      `Route liegt außerhalb der unterstützten Regionen (${SUPPORTED_REGIONS_LABEL})`
    )
  }
}

/** @deprecated use validateSupportedRoute */
export const validateDachRoute = validateSupportedRoute

export function routePointsFromGpx(text: string): {
  points: RoutePoint[]
  coordinates: [number, number][]
  elevations: number[]
  name: string
  waypoints: GpxWaypointImport[]
} {
  const { coordinates, elevations, name, waypoints } = parseGpxFile(text)
  return {
    points: buildRoutePoints(coordinates, elevations),
    coordinates,
    elevations,
    name,
    waypoints,
  }
}

export function simplifyCoords(
  coords: [number, number][],
  maxPoints = 3000
): [number, number][] {
  if (coords.length <= maxPoints) return coords
  const step = Math.ceil(coords.length / maxPoints)
  const simplified = coords.filter((_, i) => i % step === 0)
  const last = coords[coords.length - 1]!
  if (simplified.at(-1)?.[0] !== last[0] || simplified.at(-1)?.[1] !== last[1]) {
    simplified.push(last)
  }
  return simplified
}

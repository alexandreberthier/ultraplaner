import { gpx } from '@tmcw/togeojson'
import { DOMParser } from '@xmldom/xmldom'
import type { RoutePoint } from '../../shared/types'
import {
  DACH_BBOX,
  DACH_MIN_POINTS_RATIO,
  MAX_GPX_SIZE_BYTES,
  MAX_ROUTE_KM,
} from '../config/poiCategories'
import { isInBbox } from './geo'
import { buildRoutePoints, totalRouteKm } from '../utils/route'

export function parseGpxFile(text: string): {
  coordinates: [number, number][]
  elevations: number[]
  name: string
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
        elevations.push(coord[2] ?? 0)
      }
    } else if (feature.geometry.type === 'MultiLineString') {
      for (const line of feature.geometry.coordinates) {
        for (const coord of line) {
          coordinates.push([coord[0], coord[1]])
          elevations.push(coord[2] ?? 0)
        }
      }
    }
  }

  if (coordinates.length < 2) {
    throw new Error('GPX enthält keine gültige Strecke')
  }

  return { coordinates, elevations, name }
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

export function validateDachRoute(coordinates: [number, number][]): void {
  const inBbox = coordinates.filter(([lng, lat]) => isInBbox(lat, lng, DACH_BBOX))
  const ratio = inBbox.length / coordinates.length

  if (ratio < DACH_MIN_POINTS_RATIO) {
    throw new Error('Nur DACH-Routen in v1 unterstützt (Österreich, Deutschland, Schweiz, Liechtenstein)')
  }
}

export function routePointsFromGpx(text: string): {
  points: RoutePoint[]
  coordinates: [number, number][]
  name: string
} {
  const { coordinates, elevations, name } = parseGpxFile(text)
  return {
    points: buildRoutePoints(coordinates, elevations),
    coordinates,
    name,
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

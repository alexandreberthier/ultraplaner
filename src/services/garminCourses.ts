import type { Poi, PoiCategory, RoutePoint } from '../../shared/types'
import { routeElevationGainLoss, totalRouteKm } from '../utils/route'
import { haversineM } from './geo'
import { getGarminAccessToken } from './garminAuth'
import { deviceWaypointName } from './export'

const COURSE_URL = 'https://apis.garmin.com/training-api/courses/v1/course'
/** Garmin docs: ~every 100 m, max ~10_000 geo-points. */
const TARGET_SPACING_M = 100
const MAX_GEO_POINTS = 10_000

type GarminCoursePointType =
  | 'GENERIC'
  | 'WATER'
  | 'FOOD'
  | 'STORE'
  | 'SERVICE'
  | 'CAMPSITE'
  | 'REST_AREA'
  | 'CHECKPOINT'
  | 'AID_STATION'
  | 'GEAR'
  | 'INFO'

type GeoPoint = {
  latitude: number
  longitude: number
  elevation?: number
  distance?: number
  information?: {
    name: string
    coursePointType: GarminCoursePointType
  }
}

export type GarminCourseUploadInput = {
  name: string
  description?: string
  routePoints: RoutePoint[]
  waypoints: Poi[]
}

function coursePointType(category: PoiCategory): GarminCoursePointType {
  switch (category) {
    case 'water':
      return 'WATER'
    case 'supermarket':
    case 'gastronomy':
      return 'FOOD'
    case 'beverages':
      return 'STORE'
    case 'fuel':
      return 'SERVICE'
    case 'campsite':
      return 'CAMPSITE'
    case 'hotel':
    case 'sleep':
      return 'REST_AREA'
    case 'bike':
      return 'GEAR'
    case 'checkpoint':
      return 'CHECKPOINT'
    case 'border':
      return 'INFO'
    default:
      return 'GENERIC'
  }
}

/** Resample track to ~100 m spacing (Garmin acceptance criteria). */
export function thinRouteForGarmin(points: RoutePoint[]): RoutePoint[] {
  if (points.length < 2) return points
  const out: RoutePoint[] = [points[0]!]
  let last = points[0]!
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!
    if (haversineM(last, p) >= TARGET_SPACING_M) {
      out.push(p)
      last = p
    }
  }
  const end = points[points.length - 1]!
  const prev = out[out.length - 1]!
  if (prev.lat !== end.lat || prev.lng !== end.lng) out.push(end)

  if (out.length <= MAX_GEO_POINTS) return out
  const step = Math.ceil(out.length / MAX_GEO_POINTS)
  const sampled = out.filter((_, i) => i % step === 0)
  const lastSampled = sampled[sampled.length - 1]
  if (!lastSampled || lastSampled.lat !== end.lat || lastSampled.lng !== end.lng) {
    sampled.push(end)
  }
  return sampled
}

function toGeoPoints(track: RoutePoint[]): GeoPoint[] {
  return track.map((p) => ({
    latitude: p.lat,
    longitude: p.lng,
    ...(p.elevation != null && Number.isFinite(p.elevation)
      ? { elevation: p.elevation }
      : {}),
  }))
}

function attachWaypoints(geoPoints: GeoPoint[], waypoints: Poi[]): GeoPoint[] {
  if (!waypoints.length) return geoPoints
  const out = [...geoPoints]
  for (const wp of waypoints) {
    let bestIdx = 0
    let bestDist = Infinity
    for (let i = 0; i < out.length; i++) {
      const g = out[i]!
      const d = haversineM(
        { lat: g.latitude, lng: g.longitude },
        { lat: wp.lat, lng: wp.lng }
      )
      if (d < bestDist) {
        bestDist = d
        bestIdx = i
      }
    }
    // If far from track, insert a dedicated geo point
    if (bestDist > 80) {
      out.splice(bestIdx + 1, 0, {
        latitude: wp.lat,
        longitude: wp.lng,
        distance: (wp.distanceAlongRouteKm ?? 0) * 1000,
        information: {
          name: deviceWaypointName(wp).slice(0, 40) || 'Stop',
          coursePointType: coursePointType(wp.category),
        },
      })
    } else {
      const g = out[bestIdx]!
      out[bestIdx] = {
        ...g,
        distance: (wp.distanceAlongRouteKm ?? 0) * 1000,
        information: {
          name: deviceWaypointName(wp).slice(0, 40) || 'Stop',
          coursePointType: coursePointType(wp.category),
        },
      }
    }
  }
  return out
}

export async function uploadGarminCourse(
  input: GarminCourseUploadInput
): Promise<{ courseId?: number }> {
  if (input.routePoints.length < 2) throw new Error('Route empty')

  const track = thinRouteForGarmin(input.routePoints)
  const geoPoints = attachWaypoints(toGeoPoints(track), input.waypoints)
  const { ascentM, descentM } = routeElevationGainLoss(input.routePoints)
  const distanceM = totalRouteKm(input.routePoints) * 1000

  const body = {
    courseName: (input.name || 'UltraPlaner').slice(0, 100),
    description: (input.description || 'UltraPlaner').slice(0, 500),
    distance: Math.max(1, Math.round(distanceM * 100) / 100),
    elevationGain: Math.max(0, Math.round(ascentM * 100) / 100),
    elevationLoss: Math.max(0, Math.round(descentM * 100) / 100),
    geoPoints,
    activityType: 'ROAD_CYCLING',
    coordinateSystem: 'WGS84',
  }

  const token = await getGarminAccessToken()
  const res = await fetch(COURSE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Garmin course error ${res.status}: ${text.slice(0, 240)}`)
  }

  const data = (await res.json().catch(() => ({}))) as { courseId?: number }
  return { courseId: data.courseId }
}

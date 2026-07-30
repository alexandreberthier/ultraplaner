import { Encoder, Profile } from '@garmin/fitsdk'
import type { Poi, PoiCategory, RoutePoint } from '../../shared/types'
import { totalRouteKm } from '../utils/route'
import { deviceWaypointName } from './export'

/** Assumed riding speed for synthetic FIT timestamps (~20 km/h). */
const ASSUMED_SPEED_M_S = 20 / 3.6

/** Garmin Edge devices typically allow ~200 course points (incl. turns). */
export const MAX_FIT_COURSE_POINTS = 200

function degreesToSemicircles(deg: number): number {
  return Math.round(deg * (2 ** 31 / 180))
}

function downsamplePoints(points: RoutePoint[], maxPoints: number): RoutePoint[] {
  if (points.length <= maxPoints) return points
  const step = Math.ceil(points.length / maxPoints)
  const out = points.filter((_, i) => i % step === 0)
  const last = points[points.length - 1]!
  const prev = out[out.length - 1]
  if (!prev || prev.lat !== last.lat || prev.lng !== last.lng) out.push(last)
  return out
}

function fitCoursePointType(category: PoiCategory): string {
  switch (category) {
    case 'water':
      return 'water'
    case 'supermarket':
    case 'gastronomy':
      return 'food'
    case 'beverages':
      return 'sportsDrink'
    case 'fuel':
      return 'service'
    case 'campsite':
      return 'campsite'
    case 'hotel':
    case 'sleep':
      return 'restArea'
    case 'bike':
      return 'gear'
    case 'checkpoint':
      return 'checkpoint'
    case 'border':
      return 'generic'
    default:
      return 'generic'
  }
}

function timestampAtDistance(start: Date, distanceM: number): Date {
  return new Date(start.getTime() + (distanceM / ASSUMED_SPEED_M_S) * 1000)
}

function writeMesg(encoder: Encoder, mesgNum: number, fields: Record<string, unknown>) {
  // FIT SDK Mesg typing is intentionally narrow; encoder accepts camelCase profile fields.
  encoder.onMesg(mesgNum, fields as never)
}

/**
 * Build a FIT Course file: track records + favorite POIs as course points
 * (name, type, distance from start, matching timestamp).
 */
export function buildFitCourseExport(
  name: string,
  routePoints: RoutePoint[],
  waypoints: Poi[]
): Uint8Array {
  if (routePoints.length < 2) {
    throw new Error('Route too short for FIT export')
  }

  const points = downsamplePoints(routePoints, 8000)
  const startPt = points[0]!
  const endPt = points[points.length - 1]!
  // RoutePoint.distanceFromStart is kilometres; FIT distance fields are metres
  const totalDistanceM = totalRouteKm(points) * 1000
  const start = new Date()
  const end = timestampAtDistance(start, totalDistanceM)

  const encoder = new Encoder()

  writeMesg(encoder, Profile.MesgNum.FILE_ID, {
    type: 'course',
    manufacturer: 'development',
    product: 1,
    timeCreated: start,
    serialNumber: 1,
  })

  writeMesg(encoder, Profile.MesgNum.COURSE, {
    name: name.slice(0, 31),
    sport: 'cycling',
  })

  writeMesg(encoder, Profile.MesgNum.LAP, {
    timestamp: end,
    startTime: start,
    totalTimerTime: Math.max(1, (end.getTime() - start.getTime()) / 1000),
    startPositionLat: degreesToSemicircles(startPt.lat),
    startPositionLong: degreesToSemicircles(startPt.lng),
    endPositionLat: degreesToSemicircles(endPt.lat),
    endPositionLong: degreesToSemicircles(endPt.lng),
    totalDistance: totalDistanceM,
  })

  writeMesg(encoder, Profile.MesgNum.EVENT, {
    timestamp: start,
    event: 'timer',
    eventType: 'start',
    eventGroup: 0,
  })

  for (const p of points) {
    const distM = (p.distanceFromStart ?? 0) * 1000
    const rec: Record<string, unknown> = {
      timestamp: timestampAtDistance(start, distM),
      positionLat: degreesToSemicircles(p.lat),
      positionLong: degreesToSemicircles(p.lng),
      distance: distM,
    }
    if (p.elevation != null && Number.isFinite(p.elevation)) {
      rec.altitude = p.elevation
    }
    writeMesg(encoder, Profile.MesgNum.RECORD, rec)
  }

  const coursePoints = [...waypoints]
    .sort((a, b) => (a.distanceAlongRouteKm ?? 0) - (b.distanceAlongRouteKm ?? 0))
    .slice(0, MAX_FIT_COURSE_POINTS)

  coursePoints.forEach((poi, index) => {
    const distM = (poi.distanceAlongRouteKm ?? 0) * 1000
    writeMesg(encoder, Profile.MesgNum.COURSE_POINT, {
      messageIndex: index,
      timestamp: timestampAtDistance(start, distM),
      positionLat: degreesToSemicircles(poi.lat),
      positionLong: degreesToSemicircles(poi.lng),
      distance: distM,
      type: fitCoursePointType(poi.category),
      name: deviceWaypointName(poi).slice(0, 31),
      favorite: 1,
    })
  })

  writeMesg(encoder, Profile.MesgNum.EVENT, {
    timestamp: end,
    event: 'timer',
    eventType: 'stopDisableAll',
    eventGroup: 0,
  })

  return encoder.close()
}

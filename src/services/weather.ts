import type { Poi, RoutePoint } from '../../shared/types'
import { hoursForDistanceKm } from '../utils/eta'
import { tGlobal } from '../i18n'

export type WeatherLabel = 'start' | 'mid' | 'end' | 'fav'

export interface WeatherSample {
  label: WeatherLabel
  title: string
  lat: number
  lng: number
  routeKm: number
  tempC: number | null
  precipProb: number | null
  windKmh: number | null
  atHour: string
  fromCache?: boolean
}

export interface RouteWeather {
  samples: WeatherSample[]
  fetchedAt: number
  fromCache: boolean
}

const TTL_MS = 2 * 60 * 60 * 1000
const memoryCache = new Map<string, RouteWeather>()

function parseStartMinutes(startTimeHHmm: string): number {
  const [h, m] = startTimeHHmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function hourIndexForEta(
  times: string[],
  startTimeHHmm: string,
  hoursAlong: number
): number {
  if (!times.length) return 0
  const startMin = parseStartMinutes(startTimeHHmm)
  const target = new Date()
  target.setHours(0, 0, 0, 0)
  target.setMinutes(startMin + Math.round(hoursAlong * 60))

  let best = 0
  let bestDiff = Infinity
  for (let i = 0; i < times.length; i++) {
    const t = new Date(times[i]!).getTime()
    const diff = Math.abs(t - target.getTime())
    if (diff < bestDiff) {
      bestDiff = diff
      best = i
    }
  }
  return best
}

function pickPoints(
  routeCoords: [number, number][],
  routePoints: RoutePoint[],
  favorites: Poi[]
): { label: WeatherLabel; title: string; lng: number; lat: number; routeKm: number }[] {
  if (routeCoords.length < 2) return []

  const last = routeCoords.length - 1
  const mid = Math.floor(routeCoords.length / 2)
  const totalKm = routePoints[routePoints.length - 1]?.distanceFromStart ?? 0

  const points: { label: WeatherLabel; title: string; lng: number; lat: number; routeKm: number }[] =
    [
      {
        label: 'start',
        title: tGlobal('weather.start'),
        lng: routeCoords[0]![0],
        lat: routeCoords[0]![1],
        routeKm: 0,
      },
      {
        label: 'mid',
        title: tGlobal('weather.mid'),
        lng: routeCoords[mid]![0],
        lat: routeCoords[mid]![1],
        routeKm: totalKm / 2,
      },
      {
        label: 'end',
        title: tGlobal('weather.end'),
        lng: routeCoords[last]![0],
        lat: routeCoords[last]![1],
        routeKm: totalKm,
      },
    ]

  const spaced = [...favorites]
    .filter((p) => p.distanceAlongRouteKm != null)
    .sort((a, b) => (a.distanceAlongRouteKm ?? 0) - (b.distanceAlongRouteKm ?? 0))

  if (spaced.length >= 2) {
    const a = spaced[0]!
    const b = spaced[spaced.length - 1]!
    if ((b.distanceAlongRouteKm ?? 0) - (a.distanceAlongRouteKm ?? 0) > 15) {
      points.push({
        label: 'fav',
        title: a.name || tGlobal('export.favorite'),
        lng: a.lng,
        lat: a.lat,
        routeKm: a.distanceAlongRouteKm ?? 0,
      })
      points.push({
        label: 'fav',
        title: b.name || tGlobal('export.favorite'),
        lng: b.lng,
        lat: b.lat,
        routeKm: b.distanceAlongRouteKm ?? 0,
      })
    }
  } else if (spaced.length === 1) {
    const a = spaced[0]!
    const km = a.distanceAlongRouteKm ?? 0
    if (km > 10 && km < totalKm - 10) {
      points.push({
        label: 'fav',
        title: a.name || tGlobal('export.favorite'),
        lng: a.lng,
        lat: a.lat,
        routeKm: km,
      })
    }
  }

  return points.slice(0, 5)
}

function cacheKey(
  mapId: string | null,
  points: { lat: number; lng: number; routeKm: number }[],
  startTimeHHmm: string,
  avgSpeedKmh: number
): string {
  const day = new Date().toISOString().slice(0, 10)
  const hash = points.map((p) => `${p.lat.toFixed(2)},${p.lng.toFixed(2)}`).join('|')
  return `${mapId ?? 'local'}|${day}|${startTimeHHmm}|${avgSpeedKmh}|${hash}`
}

export async function fetchRouteWeather(opts: {
  mapId: string | null
  routeCoords: [number, number][]
  routePoints: RoutePoint[]
  favoritePois: Poi[]
  startTimeHHmm: string
  avgSpeedKmh: number
}): Promise<RouteWeather | null> {
  const points = pickPoints(opts.routeCoords, opts.routePoints, opts.favoritePois)
  if (!points.length) return null

  const key = cacheKey(opts.mapId, points, opts.startTimeHHmm, opts.avgSpeedKmh)
  const cached = memoryCache.get(key)
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return { ...cached, fromCache: true }
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return cached ? { ...cached, fromCache: true } : null
  }

  const lat = points.map((p) => p.lat.toFixed(4)).join(',')
  const lng = points.map((p) => p.lng.toFixed(4)).join(',')
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&hourly=temperature_2m,precipitation_probability,wind_speed_10m` +
    `&forecast_days=2&timezone=auto&wind_speed_unit=kmh`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Wetter: HTTP ${res.status}`)
  const raw = await res.json()

  // Single vs multi-location response
  const locations = Array.isArray(raw) ? raw : [raw]

  const samples: WeatherSample[] = points.map((p, i) => {
    const loc = locations[i] ?? locations[0]
    const hourly = loc?.hourly
    const times: string[] = hourly?.time ?? []
    const hoursAlong = hoursForDistanceKm(p.routeKm, opts.avgSpeedKmh)
    const idx = hourIndexForEta(times, opts.startTimeHHmm, hoursAlong)
    const temp = hourly?.temperature_2m?.[idx]
    const precip = hourly?.precipitation_probability?.[idx]
    const wind = hourly?.wind_speed_10m?.[idx]
    const at = times[idx] ? times[idx]!.slice(11, 16) : ''

    return {
      label: p.label,
      title: p.title,
      lat: p.lat,
      lng: p.lng,
      routeKm: p.routeKm,
      tempC: typeof temp === 'number' ? Math.round(temp) : null,
      precipProb: typeof precip === 'number' ? precip : null,
      windKmh: typeof wind === 'number' ? Math.round(wind) : null,
      atHour: at,
    }
  })

  const result: RouteWeather = {
    samples,
    fetchedAt: Date.now(),
    fromCache: false,
  }
  memoryCache.set(key, result)
  return result
}

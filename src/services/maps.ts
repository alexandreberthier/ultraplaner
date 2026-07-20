import type { Poi, PoiCategory, SavedMapRecord, RoutePoint } from '../../shared/types'
import { getSupabase } from '../supabase'
import { tileIdsAlongRoute } from './poiQuery'
import { filterPoisToRoute } from './poiFilter'

export interface PoiFetchResult {
  pois: Poi[]
  tileCount: number
  tileIds: string[]
  timings: {
    tileIdsMs: number
    fetchMs: number
    filterMs: number
    totalMs: number
  }
}

const FETCH_CHUNK = 100
const MAP_TTL_MS = 180 * 24 * 60 * 60 * 1000

export async function fetchTilesByIds(tileIds: string[]): Promise<Poi[]> {
  const sb = getSupabase()
  const seen = new Set<string>()
  const merged: Poi[] = []

  for (let i = 0; i < tileIds.length; i += FETCH_CHUNK) {
    const chunk = tileIds.slice(i, i + FETCH_CHUNK)
    const { data, error } = await sb.from('tiles').select('geohash,pois').in('geohash', chunk)
    if (error) throw new Error(`Supabase tiles: ${error.message}`)

    for (const row of data ?? []) {
      const pois = (row.pois as Poi[]) ?? []
      for (const poi of pois) {
        if (seen.has(poi.id)) continue
        seen.add(poi.id)
        merged.push(poi)
      }
    }
  }

  return merged
}

export async function fetchPoisForRoute(
  routeCoords: [number, number][],
  routePoints: RoutePoint[],
  radiusM: number,
  categories: PoiCategory[]
): Promise<PoiFetchResult> {
  const t0 = performance.now()

  const tileIds = tileIdsAlongRoute(routeCoords, radiusM)
  const tileIdsMs = performance.now() - t0

  const tFetch = performance.now()
  const rawPois = await fetchTilesByIds(tileIds)
  const fetchMs = performance.now() - tFetch

  const tFilter = performance.now()
  const pois = filterPoisToRoute(rawPois, routePoints, radiusM, categories)
  const filterMs = performance.now() - tFilter

  const totalMs = performance.now() - t0

  console.info(
    `[perf] tiles=${tileIds.length} tileIds=${Math.round(tileIdsMs)}ms fetch=${Math.round(fetchMs)}ms filter=${Math.round(filterMs)}ms total=${Math.round(totalMs)}ms pois=${pois.length}`
  )

  return {
    pois,
    tileCount: tileIds.length,
    tileIds,
    timings: { tileIdsMs, fetchMs, filterMs, totalMs },
  }
}

function generateMapId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  for (let i = 0; i < 12; i++) {
    id += chars[Math.floor(Math.random() * chars.length)]
  }
  return id
}

interface MapRow {
  id: string
  name: string
  created_at: string
  expires_at: string
  payload: {
    routeCoords: [number, number][]
    routePoints: RoutePoint[]
    poiRadiusM: number
    categories: PoiCategory[]
    pois: Poi[]
    favorites: string[]
  }
}

export async function saveMap(
  data: Omit<SavedMapRecord, 'id' | 'createdAt' | 'expiresAt'>
): Promise<string> {
  const sb = getSupabase()
  const id = generateMapId()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + MAP_TTL_MS)

  const { error } = await sb.from('maps').insert({
    id,
    name: data.name,
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    payload: {
      routeCoords: data.routeCoords,
      routePoints: data.routePoints,
      poiRadiusM: data.poiRadiusM,
      categories: data.categories,
      pois: data.pois,
      favorites: data.favorites,
    },
  })

  if (error) throw new Error(`Karte speichern: ${error.message}`)
  return id
}

export async function loadMap(mapId: string): Promise<SavedMapRecord | null> {
  const sb = getSupabase()
  const { data, error } = await sb.from('maps').select('*').eq('id', mapId).maybeSingle()
  if (error) throw new Error(`Karte laden: ${error.message}`)
  if (!data) return null

  const row = data as MapRow
  if (new Date(row.expires_at).getTime() < Date.now()) return null

  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    routeCoords: row.payload.routeCoords,
    routePoints: row.payload.routePoints,
    poiRadiusM: row.payload.poiRadiusM,
    categories: row.payload.categories,
    pois: row.payload.pois,
    favorites: row.payload.favorites ?? [],
  }
}

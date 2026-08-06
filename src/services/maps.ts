import type {
  ControlPoint,
  FavoriteMeta,
  Poi,
  PoiCategory,
  RouteSurfaceSummary,
  SavedMapRecord,
  RoutePoint,
} from '../../shared/types'
import { getSupabase } from '../supabase'
import { tileIdsAlongRoute } from './poiQuery'
import { filterPoisToRoute } from './poiFilter'
import { getOfflineMap, putOfflineMap } from './offlineMaps'
import { getCachedPoisByGeohashes } from './offlinePacks'
import { generateWriteToken, setMapWriteToken } from './mapWriteToken'
import { normalizePoiCategory } from '../utils/poiNormalize'

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

export async function fetchTilesByIds(
  tileIds: string[],
  onProgress?: (done: number, total: number) => void,
  opts?: { offlineMapId?: string | null }
): Promise<Poi[]> {
  const seen = new Set<string>()
  const merged: Poi[] = []
  const total = tileIds.length
  let done = 0

  if (total === 0) {
    onProgress?.(1, 1)
    return merged
  }

  onProgress?.(0, total)

  const offline =
    typeof navigator !== 'undefined' &&
    (!navigator.onLine || Boolean(opts?.offlineMapId))
  const packMapId = opts?.offlineMapId ?? null

  // Prefer local pack when offline or when an offline pack map id is forced
  if (packMapId && (typeof navigator === 'undefined' || !navigator.onLine)) {
    const local = await getCachedPoisByGeohashes(packMapId, tileIds)
    onProgress?.(total, total)
    return local
  }

  // If offline without pack id, try nothing useful from network
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    if (packMapId) {
      const local = await getCachedPoisByGeohashes(packMapId, tileIds)
      onProgress?.(total, total)
      return local
    }
    throw new Error('offline_no_pack')
  }

  void offline

  const sb = getSupabase()

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

    done = Math.min(total, i + chunk.length)
    onProgress?.(done, total)
  }

  return merged
}

export async function fetchPoisForRoute(
  routeCoords: [number, number][],
  routePoints: RoutePoint[],
  radiusM: number,
  categories: PoiCategory[],
  onProgress?: (phase: 'tiles' | 'fetch' | 'filter', ratio: number) => void,
  opts?: { offlineMapId?: string | null }
): Promise<PoiFetchResult> {
  const t0 = performance.now()

  onProgress?.('tiles', 0)
  const tileIds = tileIdsAlongRoute(routeCoords, radiusM)
  const tileIdsMs = performance.now() - t0
  onProgress?.('tiles', 1)

  const tFetch = performance.now()
  const rawPois = await fetchTilesByIds(
    tileIds,
    (done, total) => {
      onProgress?.('fetch', total > 0 ? done / total : 1)
    },
    { offlineMapId: opts?.offlineMapId }
  )
  const normalized = rawPois.map(normalizePoiCategory)
  const fetchMs = performance.now() - tFetch

  onProgress?.('filter', 0)
  const tFilter = performance.now()
  const pois = filterPoisToRoute(normalized, routePoints, radiusM, categories)
  const filterMs = performance.now() - tFilter
  onProgress?.('filter', 1)

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
    favoriteMeta?: Record<string, FavoriteMeta>
    controlPoints?: ControlPoint[]
    surfaceSummary?: RouteSurfaceSummary
  }
}

function rowToRecord(row: MapRow): SavedMapRecord {
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
    favoriteMeta: row.payload.favoriteMeta,
    controlPoints: row.payload.controlPoints ?? [],
    surfaceSummary: row.payload.surfaceSummary,
  }
}

function mapPayload(data: {
  routeCoords: [number, number][]
  routePoints: RoutePoint[]
  poiRadiusM: number
  categories: PoiCategory[]
  pois: Poi[]
  favorites: string[]
  favoriteMeta?: Record<string, FavoriteMeta>
  controlPoints?: ControlPoint[]
  surfaceSummary?: RouteSurfaceSummary | null
}) {
  return {
    routeCoords: data.routeCoords,
    routePoints: data.routePoints,
    poiRadiusM: data.poiRadiusM,
    categories: data.categories,
    pois: data.pois,
    favorites: data.favorites,
    favoriteMeta: data.favoriteMeta,
    controlPoints: data.controlPoints ?? [],
    ...(data.surfaceSummary ? { surfaceSummary: data.surfaceSummary } : {}),
  }
}

export async function saveMap(
  data: Omit<SavedMapRecord, 'id' | 'createdAt' | 'expiresAt'>
): Promise<string> {
  const sb = getSupabase()
  const id = generateMapId()
  const writeToken = generateWriteToken()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + MAP_TTL_MS)
  const payload = mapPayload(data)
  const name = data.name.slice(0, 200)

  const { error: rpcError } = await sb.rpc('create_shared_map', {
    p_id: id,
    p_name: name,
    p_expires_at: expiresAt.toISOString(),
    p_payload: payload,
    p_write_token: writeToken,
  })

  if (rpcError) {
    const rpcMissing =
      rpcError.code === 'PGRST202' ||
      /could not find the function|schema cache/i.test(rpcError.message)

    if (!rpcMissing) {
      throw new Error(`Karte speichern: ${rpcError.message}`)
    }

    // Fallback until supabase/maps.sql (secure RPCs) is applied
    console.warn(
      '[maps] create_shared_map fehlt — Legacy-Insert. Bitte supabase/maps.sql im SQL Editor ausführen.'
    )
    const { error: insertError } = await sb.from('maps').insert({
      id,
      name,
      created_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      payload,
    })
    if (insertError) {
      throw new Error(`Karte speichern: ${insertError.message}`)
    }
  }

  setMapWriteToken(id, writeToken)

  const record: SavedMapRecord = {
    id,
    name: data.name,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    routeCoords: data.routeCoords,
    routePoints: data.routePoints,
    poiRadiusM: data.poiRadiusM,
    categories: data.categories,
    pois: data.pois,
    favorites: data.favorites,
    favoriteMeta: data.favoriteMeta,
    controlPoints: data.controlPoints ?? [],
    surfaceSummary: data.surfaceSummary,
  }
  void putOfflineMap(record)

  return id
}

export async function updateMapPayload(
  mapId: string,
  writeToken: string,
  data: {
    routeCoords: [number, number][]
    routePoints: RoutePoint[]
    poiRadiusM: number
    categories: PoiCategory[]
    pois: Poi[]
    favorites: string[]
    favoriteMeta?: Record<string, FavoriteMeta>
    controlPoints?: ControlPoint[]
    surfaceSummary?: RouteSurfaceSummary | null
  }
): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.rpc('update_shared_map', {
    p_id: mapId,
    p_write_token: writeToken,
    p_payload: mapPayload(data),
  })
  if (error) throw new Error(`Karte aktualisieren: ${error.message}`)
}

export type LoadMapSource = 'network' | 'cache'

export interface LoadMapResult {
  record: SavedMapRecord
  source: LoadMapSource
}

export async function loadMap(mapId: string): Promise<LoadMapResult | null> {
  const offline = typeof navigator !== 'undefined' && !navigator.onLine

  if (offline) {
    const cached = await getOfflineMap(mapId)
    if (!cached) return null
    return { record: cached, source: 'cache' }
  }

  try {
    const sb = getSupabase()
    const { data, error } = await sb
      .from('maps')
      .select('id,name,created_at,expires_at,payload')
      .eq('id', mapId)
      .maybeSingle()
    if (error) throw new Error(`Karte laden: ${error.message}`)
    if (!data) {
      const cached = await getOfflineMap(mapId)
      return cached ? { record: cached, source: 'cache' } : null
    }

    const row = data as MapRow
    if (new Date(row.expires_at).getTime() < Date.now()) {
      const cached = await getOfflineMap(mapId)
      return cached ? { record: cached, source: 'cache' } : null
    }

    const record = rowToRecord(row)
    void putOfflineMap(record)
    return { record, source: 'network' }
  } catch (err) {
    const cached = await getOfflineMap(mapId)
    if (cached) return { record: cached, source: 'cache' }
    throw err
  }
}

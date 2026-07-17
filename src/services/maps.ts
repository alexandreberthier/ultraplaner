import {
  doc,
  getDoc,
  setDoc,
  Timestamp,
  type Firestore,
} from 'firebase/firestore'
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

export async function saveMap(
  db: Firestore,
  data: Omit<SavedMapRecord, 'id' | 'createdAt' | 'expiresAt'>
): Promise<string> {
  const id = generateMapId()
  const now = Timestamp.now()
  const expiresAt = Timestamp.fromMillis(now.toMillis() + 180 * 24 * 60 * 60 * 1000)

  const record: SavedMapRecord = {
    ...data,
    id,
    createdAt: now,
    expiresAt,
  }

  await setDoc(doc(db, 'maps', id), record)
  return id
}

export async function loadMap(db: Firestore, mapId: string): Promise<SavedMapRecord | null> {
  const snap = await getDoc(doc(db, 'maps', mapId))
  if (!snap.exists()) return null
  return snap.data() as SavedMapRecord
}

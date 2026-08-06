/**
 * Offline packs: Geohash POI tiles + CyclOSM raster corridor in IndexedDB.
 * Same DB as offlineMaps (`ultraplaner-offline`), version 2+.
 */
import type { Poi } from '../../shared/types'
import { haversineCoords } from './geo'
import { tileIdsAlongRoute, encodeGeohash5 } from './poiQuery'
import { getSupabase } from '../supabase'
import { normalizePoiCategory } from '../utils/poiNormalize'

const DB_NAME = 'ultraplaner-offline'
/** Bump from offlineMaps v1 — creates poiTiles / rasterTiles / packMeta */
export const OFFLINE_PACK_DB_VERSION = 2

const STORE_MAPS = 'maps'
const STORE_POI = 'poiTiles'
const STORE_RASTER = 'rasterTiles'
const STORE_META = 'packMeta'

export const PACK_MIN_ZOOM = 10
export const PACK_MAX_ZOOM = 13
export const PACK_CORRIDOR_M = 1500
/** Hard cap ~280 MB */
export const PACK_MAX_BYTES = 280 * 1024 * 1024
const RASTER_CONCURRENCY = 5
const CYCLOSM_HOSTS = [
  'https://a.tile-cyclosm.openstreetmap.fr/cyclosm',
  'https://b.tile-cyclosm.openstreetmap.fr/cyclosm',
  'https://c.tile-cyclosm.openstreetmap.fr/cyclosm',
] as const

export type PackStatus = 'ready' | 'building' | 'error' | 'partial'

export interface OfflinePackMeta {
  mapId: string
  status: PackStatus
  bytes: number
  zooms: [number, number]
  corridorM: number
  poiTileCount: number
  rasterTileCount: number
  createdAt: number
  error?: string
}

interface PoiTileRow {
  /** `${mapId}:${geohash}` */
  key: string
  mapId: string
  geohash: string
  pois: Poi[]
  cachedAt: number
}

interface RasterTileRow {
  /** `${mapId}:${z}/${x}/${y}` */
  key: string
  mapId: string
  z: number
  x: number
  y: number
  blob: Blob
  cachedAt: number
  bytes: number
}

let activePackMapId: string | null = null
let protocolRegistered = false

/** Transparent 1×1 PNG for missing offline tiles */
const EMPTY_PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  ),
  (c) => c.charCodeAt(0)
)

export function setActiveOfflinePackMapId(mapId: string | null) {
  activePackMapId = mapId
}

export function getActiveOfflinePackMapId(): string | null {
  return activePackMapId
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, OFFLINE_PACK_DB_VERSION)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_MAPS)) {
        const store = db.createObjectStore(STORE_MAPS, { keyPath: 'id' })
        store.createIndex('cachedAt', 'cachedAt')
      }
      if (!db.objectStoreNames.contains(STORE_POI)) {
        const store = db.createObjectStore(STORE_POI, { keyPath: 'key' })
        store.createIndex('mapId', 'mapId')
        store.createIndex('geohash', 'geohash')
      }
      if (!db.objectStoreNames.contains(STORE_RASTER)) {
        const store = db.createObjectStore(STORE_RASTER, { keyPath: 'key' })
        store.createIndex('mapId', 'mapId')
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'mapId' })
      }
    }
  })
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

async function withStores<T>(
  storeNames: string[],
  mode: IDBTransactionMode,
  fn: (stores: Record<string, IDBObjectStore>) => Promise<T>
): Promise<T> {
  const db = await openDb()
  try {
    const tx = db.transaction(storeNames, mode)
    const stores: Record<string, IDBObjectStore> = {}
    for (const name of storeNames) {
      stores[name] = tx.objectStore(name)
    }
    const result = await fn(stores)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB tx failed'))
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB tx aborted'))
    })
    return result
  } finally {
    db.close()
  }
}

export async function getPackMeta(mapId: string): Promise<OfflinePackMeta | null> {
  if (typeof indexedDB === 'undefined') return null
  try {
    return await withStores([STORE_META], 'readonly', async (stores) => {
      const row = await idbReq(
        stores[STORE_META]!.get(mapId) as IDBRequest<OfflinePackMeta | undefined>
      )
      return row ?? null
    })
  } catch {
    return null
  }
}

export async function putPackMeta(meta: OfflinePackMeta): Promise<void> {
  await withStores([STORE_META], 'readwrite', async (stores) => {
    await idbReq(stores[STORE_META]!.put(meta))
  })
}

export async function deleteOfflinePack(mapId: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  await withStores([STORE_POI, STORE_RASTER, STORE_META], 'readwrite', async (stores) => {
    const poiIdx = stores[STORE_POI]!.index('mapId')
    const poiKeys = await idbReq(poiIdx.getAllKeys(mapId) as IDBRequest<IDBValidKey[]>)
    for (const k of poiKeys) await idbReq(stores[STORE_POI]!.delete(k))

    const rasIdx = stores[STORE_RASTER]!.index('mapId')
    const rasKeys = await idbReq(rasIdx.getAllKeys(mapId) as IDBRequest<IDBValidKey[]>)
    for (const k of rasKeys) await idbReq(stores[STORE_RASTER]!.delete(k))

    await idbReq(stores[STORE_META]!.delete(mapId))
  })
  if (activePackMapId === mapId) activePackMapId = null
}

export async function getCachedPoisByGeohashes(
  mapId: string,
  geohashes: string[]
): Promise<Poi[]> {
  if (typeof indexedDB === 'undefined' || geohashes.length === 0) return []
  const seen = new Set<string>()
  const merged: Poi[] = []
  try {
    await withStores([STORE_POI], 'readonly', async (stores) => {
      for (const gh of geohashes) {
        const key = `${mapId}:${gh}`
        const row = await idbReq(
          stores[STORE_POI]!.get(key) as IDBRequest<PoiTileRow | undefined>
        )
        if (!row) continue
        for (const poi of row.pois) {
          if (seen.has(poi.id)) continue
          seen.add(poi.id)
          merged.push(poi)
        }
      }
    })
  } catch (err) {
    console.warn('[offlinePack] POI tiles lesen fehlgeschlagen:', err)
  }
  return merged
}

/** True if at least one POI geohash tile exists in the pack (coverage check). */
export async function hasAnyCachedPoiTile(
  mapId: string,
  geohashes: string[]
): Promise<boolean> {
  if (typeof indexedDB === 'undefined' || geohashes.length === 0) return false
  try {
    return await withStores([STORE_POI], 'readonly', async (stores) => {
      for (const gh of geohashes) {
        const key = `${mapId}:${gh}`
        const row = await idbReq(
          stores[STORE_POI]!.get(key) as IDBRequest<PoiTileRow | undefined>
        )
        if (row) return true
      }
      return false
    })
  } catch {
    return false
  }
}

export async function getRasterTileBlob(
  mapId: string,
  z: number,
  x: number,
  y: number
): Promise<Blob | null> {
  if (typeof indexedDB === 'undefined') return null
  try {
    return await withStores([STORE_RASTER], 'readonly', async (stores) => {
      const key = `${mapId}:${z}/${x}/${y}`
      const row = await idbReq(
        stores[STORE_RASTER]!.get(key) as IDBRequest<RasterTileRow | undefined>
      )
      return row?.blob ?? null
    })
  } catch {
    return null
  }
}

function lngLatToTile(lng: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z
  const x = Math.floor(((lng + 180) / 360) * n)
  const latRad = (lat * Math.PI) / 180
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  )
  return {
    x: Math.max(0, Math.min(n - 1, x)),
    y: Math.max(0, Math.min(n - 1, y)),
  }
}

/** Approximate metres per tile at latitude for zoom z (tile width). */
function tileWidthM(lat: number, z: number): number {
  const latRad = (lat * Math.PI) / 180
  return (Math.cos(latRad) * 2 * Math.PI * 6_371_000) / 2 ** z
}

export function collectRasterTileKeys(
  routeCoords: [number, number][],
  corridorM: number,
  minZoom: number,
  maxZoom: number
): { z: number; x: number; y: number }[] {
  if (routeCoords.length === 0) return []
  const sampled = sampleRouteByDistance(routeCoords, 400)
  const keys = new Set<string>()
  const out: { z: number; x: number; y: number }[] = []

  for (let z = minZoom; z <= maxZoom; z++) {
    for (const [lng, lat] of sampled) {
      const { x, y } = lngLatToTile(lng, lat, z)
      const w = tileWidthM(lat, z)
      const ring = Math.max(0, Math.ceil(corridorM / Math.max(w, 1)))
      const n = 2 ** z
      for (let dx = -ring; dx <= ring; dx++) {
        for (let dy = -ring; dy <= ring; dy++) {
          const xx = x + dx
          const yy = y + dy
          if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue
          const k = `${z}/${xx}/${yy}`
          if (keys.has(k)) continue
          keys.add(k)
          out.push({ z, x: xx, y: yy })
        }
      }
    }
  }
  return out
}

function sampleRouteByDistance(
  coords: [number, number][],
  stepM: number
): [number, number][] {
  if (coords.length === 0) return []
  const out: [number, number][] = [coords[0]!]
  let acc = 0
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1]!
    const b = coords[i]!
    acc += haversineCoords(a, b)
    if (acc >= stepM) {
      out.push(b)
      acc = 0
    }
  }
  const last = coords[coords.length - 1]!
  if (out[out.length - 1] !== last) out.push(last)
  return out
}

/** Rough size estimate before download (raster dominant). */
export function estimatePackBytes(
  routeCoords: [number, number][],
  opts?: { corridorM?: number; minZoom?: number; maxZoom?: number }
): { rasterTiles: number; estimatedBytes: number } {
  const corridorM = opts?.corridorM ?? PACK_CORRIDOR_M
  const minZoom = opts?.minZoom ?? PACK_MIN_ZOOM
  const maxZoom = opts?.maxZoom ?? PACK_MAX_ZOOM
  const tiles = collectRasterTileKeys(routeCoords, corridorM, minZoom, maxZoom)
  // ~12–18 KB average CyclOSM PNG at these zooms
  const avgBytes = 14_000
  return {
    rasterTiles: tiles.length,
    estimatedBytes: tiles.length * avgBytes,
  }
}

export interface PackProgress {
  phase: 'pois' | 'raster' | 'done'
  ratio: number
  bytes: number
  message?: string
}

export type PackAbortSignal = { aborted: boolean }

export async function buildOfflinePack(
  mapId: string,
  routeCoords: [number, number][],
  opts?: {
    corridorM?: number
    minZoom?: number
    maxZoom?: number
    /** POI corridor for geohash fetch (use generous radius) */
    poiRadiusM?: number
    signal?: PackAbortSignal
    onProgress?: (p: PackProgress) => void
  }
): Promise<OfflinePackMeta> {
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB unavailable')
  }
  if (routeCoords.length < 2) {
    throw new Error('Route too short for offline pack')
  }

  const corridorM = opts?.corridorM ?? PACK_CORRIDOR_M
  const minZoom = opts?.minZoom ?? PACK_MIN_ZOOM
  const maxZoom = opts?.maxZoom ?? PACK_MAX_ZOOM
  const poiRadiusM = opts?.poiRadiusM ?? Math.max(corridorM, 2000)
  const signal = opts?.signal

  await deleteOfflinePack(mapId)

  const building: OfflinePackMeta = {
    mapId,
    status: 'building',
    bytes: 0,
    zooms: [minZoom, maxZoom],
    corridorM,
    poiTileCount: 0,
    rasterTileCount: 0,
    createdAt: Date.now(),
  }
  await putPackMeta(building)
  opts?.onProgress?.({ phase: 'pois', ratio: 0, bytes: 0 })

  // --- POI geohash tiles ---
  const tileIds = tileIdsAlongRoute(routeCoords, poiRadiusM)
  const sb = getSupabase()
  const FETCH_CHUNK = 100
  const rawPois: Poi[] = []
  const seenPoi = new Set<string>()
  for (let i = 0; i < tileIds.length; i += FETCH_CHUNK) {
    if (signal?.aborted) break
    const chunk = tileIds.slice(i, i + FETCH_CHUNK)
    const { data, error } = await sb.from('tiles').select('geohash,pois').in('geohash', chunk)
    if (error) throw new Error(`Supabase tiles: ${error.message}`)
    for (const row of data ?? []) {
      for (const poi of (row.pois as Poi[]) ?? []) {
        if (seenPoi.has(poi.id)) continue
        seenPoi.add(poi.id)
        rawPois.push(poi)
      }
    }
    opts?.onProgress?.({
      phase: 'pois',
      ratio: tileIds.length > 0 ? Math.min(1, (i + chunk.length) / tileIds.length) : 1,
      bytes: 0,
    })
  }
  if (signal?.aborted) {
    await deleteOfflinePack(mapId)
    throw new Error('aborted')
  }

  const byGh = new Map<string, Poi[]>()
  for (const id of tileIds) byGh.set(id, [])
  for (const poi of rawPois.map(normalizePoiCategory)) {
    const gh = encodeGeohash5(poi.lat, poi.lng)
    const list = byGh.get(gh)
    if (list) list.push(poi)
    else byGh.set(gh, [poi])
  }

  const now = Date.now()
  let poiTileCount = 0
  await withStores([STORE_POI], 'readwrite', async (stores) => {
    for (const [geohash, pois] of byGh) {
      const row: PoiTileRow = {
        key: `${mapId}:${geohash}`,
        mapId,
        geohash,
        pois,
        cachedAt: now,
      }
      await idbReq(stores[STORE_POI]!.put(row))
      poiTileCount++
    }
  })

  // --- Raster tiles ---
  const rasterKeys = collectRasterTileKeys(routeCoords, corridorM, minZoom, maxZoom)
  let bytes = 0
  let rasterTileCount = 0
  opts?.onProgress?.({ phase: 'raster', ratio: 0, bytes: 0 })

  const queue = [...rasterKeys]
  let done = 0
  const total = queue.length

  async function worker() {
    while (queue.length > 0) {
      if (signal?.aborted) return
      if (bytes >= PACK_MAX_BYTES) return
      const tile = queue.shift()
      if (!tile) return
      const host = CYCLOSM_HOSTS[done % CYCLOSM_HOSTS.length]!
      const url = `${host}/${tile.z}/${tile.x}/${tile.y}.png`
      try {
        const res = await fetch(url)
        if (!res.ok) {
          done++
          opts?.onProgress?.({
            phase: 'raster',
            ratio: total > 0 ? done / total : 1,
            bytes,
          })
          continue
        }
        const blob = await res.blob()
        if (bytes + blob.size > PACK_MAX_BYTES) {
          bytes += blob.size
          done = total
          return
        }
        const row: RasterTileRow = {
          key: `${mapId}:${tile.z}/${tile.x}/${tile.y}`,
          mapId,
          z: tile.z,
          x: tile.x,
          y: tile.y,
          blob,
          cachedAt: Date.now(),
          bytes: blob.size,
        }
        await withStores([STORE_RASTER], 'readwrite', async (stores) => {
          await idbReq(stores[STORE_RASTER]!.put(row))
        })
        bytes += blob.size
        rasterTileCount++
      } catch {
        /* skip failed tile */
      }
      done++
      opts?.onProgress?.({
        phase: 'raster',
        ratio: total > 0 ? done / total : 1,
        bytes,
      })
    }
  }

  await Promise.all(
    Array.from({ length: RASTER_CONCURRENCY }, () => worker())
  )

  if (signal?.aborted) {
    await deleteOfflinePack(mapId)
    throw new Error('aborted')
  }

  const capped = bytes >= PACK_MAX_BYTES
  const meta: OfflinePackMeta = {
    mapId,
    status: capped ? 'partial' : 'ready',
    bytes,
    zooms: [minZoom, maxZoom],
    corridorM,
    poiTileCount,
    rasterTileCount,
    createdAt: Date.now(),
    error: capped ? 'size_cap' : undefined,
  }
  await putPackMeta(meta)
  opts?.onProgress?.({ phase: 'done', ratio: 1, bytes })
  setActiveOfflinePackMapId(mapId)
  return meta
}

/** Register MapLibre protocol once — serves cyclosm tiles from pack or network. */
export function ensureCyclosmOfflineProtocol(
  maplibregl: typeof import('maplibre-gl')
): void {
  if (protocolRegistered) return
  protocolRegistered = true

  maplibregl.addProtocol('cyclosm-offline', async (params) => {
    // url: cyclosm-offline://{z}/{x}/{y}
    const path = (params.url || '').replace(/^cyclosm-offline:\/\//, '')
    const [zs, xs, ys] = path.split('/')
    const z = Number(zs)
    const x = Number(xs)
    const y = Number(ys)
    const mapId = activePackMapId

    if (mapId && Number.isFinite(z) && Number.isFinite(x) && Number.isFinite(y)) {
      const blob = await getRasterTileBlob(mapId, z, x, y)
      if (blob) {
        const data = await blob.arrayBuffer()
        return { data }
      }
    }

    // Network fallback when online
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      const host = CYCLOSM_HOSTS[Math.abs(x + y) % CYCLOSM_HOSTS.length]!
      const url = `${host}/${z}/${x}/${y}.png`
      try {
        const res = await fetch(url)
        if (res.ok) {
          const data = await res.arrayBuffer()
          return { data }
        }
      } catch {
        /* fall through */
      }
    }

    return { data: EMPTY_PNG.slice().buffer }
  })
}

/** CyclOSM style using offline-aware protocol */
export function cyclosmOfflineStyle(): import('maplibre-gl').StyleSpecification {
  return {
    version: 8,
    name: 'CyclOSM Offline',
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      cyclosm: {
        type: 'raster',
        tiles: ['cyclosm-offline://{z}/{x}/{y}'],
        tileSize: 256,
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://www.cyclosm.org">CyclOSM</a>',
        maxzoom: 20,
      },
    },
    layers: [
      {
        id: 'cyclosm',
        type: 'raster',
        source: 'cyclosm',
      },
    ],
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

import type { SavedMapRecord } from '../../shared/types'

const DB_NAME = 'ultraplaner-offline'
/** Keep in sync with offlinePacks.OFFLINE_PACK_DB_VERSION */
const DB_VERSION = 2
const STORE = 'maps'
const MAX_MAPS = 20

interface OfflineMapEntry {
  id: string
  name: string
  cachedAt: number
  record: SavedMapRecord
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('cachedAt', 'cachedAt')
      }
      // Pack stores (also created in offlinePacks onupgrade)
      if (!db.objectStoreNames.contains('poiTiles')) {
        const store = db.createObjectStore('poiTiles', { keyPath: 'key' })
        store.createIndex('mapId', 'mapId')
        store.createIndex('geohash', 'geohash')
      }
      if (!db.objectStoreNames.contains('rasterTiles')) {
        const store = db.createObjectStore('rasterTiles', { keyPath: 'key' })
        store.createIndex('mapId', 'mapId')
      }
      if (!db.objectStoreNames.contains('packMeta')) {
        db.createObjectStore('packMeta', { keyPath: 'mapId' })
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

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T>
): Promise<T> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, mode)
    const store = tx.objectStore(STORE)
    const result = await fn(store)
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

async function trimToMax(store: IDBObjectStore): Promise<void> {
  const all = (await idbReq(store.getAll())) as OfflineMapEntry[]
  if (all.length <= MAX_MAPS) return
  all.sort((a, b) => a.cachedAt - b.cachedAt)
  const excess = all.length - MAX_MAPS
  for (let i = 0; i < excess; i++) {
    await idbReq(store.delete(all[i]!.id))
  }
}

export async function putOfflineMap(record: SavedMapRecord): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  // IndexedDB can't clone Vue proxies — store a plain snapshot
  let plain: SavedMapRecord
  try {
    plain = JSON.parse(JSON.stringify(record)) as SavedMapRecord
  } catch (err) {
    console.warn('[offline] Cache serialisieren fehlgeschlagen:', err)
    return
  }
  const entry: OfflineMapEntry = {
    id: plain.id,
    name: plain.name,
    cachedAt: Date.now(),
    record: plain,
  }
  try {
    await withStore('readwrite', async (store) => {
      await idbReq(store.put(entry))
      await trimToMax(store)
    })
  } catch (err) {
    console.warn('[offline] Cache schreiben fehlgeschlagen:', err)
  }
}

export async function getOfflineMap(id: string): Promise<SavedMapRecord | null> {
  if (typeof indexedDB === 'undefined') return null
  try {
    const entry = await withStore('readonly', (store) =>
      idbReq(store.get(id) as IDBRequest<OfflineMapEntry | undefined>)
    )
    return entry?.record ?? null
  } catch (err) {
    console.warn('[offline] Cache lesen fehlgeschlagen:', err)
    return null
  }
}

export async function listOfflineMaps(): Promise<
  { id: string; name: string; cachedAt: number; totalKm: number; poiCount: number }[]
> {
  if (typeof indexedDB === 'undefined') return []
  try {
    const all = await withStore('readonly', (store) =>
      idbReq(store.getAll() as IDBRequest<OfflineMapEntry[]>)
    )
    return (all ?? [])
      .map((e) => {
        const pts = e.record.routePoints
        const totalKm = pts[pts.length - 1]?.distanceFromStart ?? 0
        return {
          id: e.id,
          name: e.name,
          cachedAt: e.cachedAt,
          totalKm,
          poiCount: e.record.pois?.length ?? 0,
        }
      })
      .sort((a, b) => b.cachedAt - a.cachedAt)
  } catch {
    return []
  }
}

export async function deleteOfflineMap(id: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  try {
    await withStore('readwrite', async (store) => {
      await idbReq(store.delete(id))
    })
    const { deleteOfflinePack } = await import('./offlinePacks')
    await deleteOfflinePack(id)
  } catch (err) {
    console.warn('[offline] Cache löschen fehlgeschlagen:', err)
  }
}

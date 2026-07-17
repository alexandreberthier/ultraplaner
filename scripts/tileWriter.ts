import type { Firestore } from 'firebase-admin/firestore'
import { FieldValue } from 'firebase-admin/firestore'
import ngeohash from 'ngeohash'
import type { Poi } from '../shared/types.ts'

export const MAX_DOC_BYTES = 900_000
export const GEOHASH_PRECISION = 5
const SHARD_SUFFIXES = ['_a', '_b', '_c', '_d', '_e', '_f', '_g', '_h'] as const

export function groupPoisByGeohash(pois: Poi[]): Map<string, Poi[]> {
  const groups = new Map<string, Poi[]>()
  for (const poi of pois) {
    const tileId = ngeohash.encode(poi.lat, poi.lng, GEOHASH_PRECISION)
    const list = groups.get(tileId) ?? []
    list.push(poi)
    groups.set(tileId, list)
  }
  return groups
}

export function dedupePois(pois: Poi[]): Poi[] {
  const seen = new Set<string>()
  const out: Poi[] = []
  for (const p of pois) {
    if (seen.has(p.id)) continue
    seen.add(p.id)
    out.push(p)
  }
  return out
}

function docPayload(tileId: string, pois: Poi[]) {
  return {
    tileId,
    poiCount: pois.length,
    pois,
    updatedAt: FieldValue.serverTimestamp(),
  }
}

function estimateSize(pois: Poi[]): number {
  return JSON.stringify(docPayload('x', pois)).length
}

function splitPoisToFit(pois: Poi[]): Poi[][] {
  if (!pois.length) return []
  if (estimateSize(pois) <= MAX_DOC_BYTES) return [pois]

  const mid = Math.ceil(pois.length / 2)
  const left = pois.slice(0, mid)
  const right = pois.slice(mid)
  return [...splitPoisToFit(left), ...splitPoisToFit(right)]
}

export function tileDocIds(baseId: string): string[] {
  return [baseId, ...SHARD_SUFFIXES.map((s) => `${baseId}${s}`)]
}

export async function readTilePois(db: Firestore, baseId: string): Promise<Poi[]> {
  const baseSnap = await db.collection('tiles').doc(baseId).get()
  if (baseSnap.exists) {
    return (baseSnap.data()?.pois as Poi[]) ?? []
  }

  const pois: Poi[] = []
  for (const suffix of SHARD_SUFFIXES) {
    const snap = await db.collection('tiles').doc(`${baseId}${suffix}`).get()
    if (!snap.exists) break
    pois.push(...((snap.data()?.pois as Poi[]) ?? []))
  }
  return pois
}

async function deleteTileDocs(db: Firestore, baseId: string): Promise<void> {
  const batch = db.batch()
  for (const id of tileDocIds(baseId)) {
    batch.delete(db.collection('tiles').doc(id))
  }
  await batch.commit()
}

export async function writeTileWithSplit(
  db: Firestore,
  baseId: string,
  pois: Poi[],
  options?: { replaceExisting?: boolean }
): Promise<number> {
  const unique = dedupePois(pois)
  if (options?.replaceExisting !== false) {
    await deleteTileDocs(db, baseId)
  }

  const chunks = splitPoisToFit(unique)
  if (chunks.length === 1) {
    await db.collection('tiles').doc(baseId).set(docPayload(baseId, chunks[0]!))
    return 1
  }

  let written = 0
  for (let i = 0; i < chunks.length; i++) {
    const suffix = SHARD_SUFFIXES[i]
    if (!suffix) throw new Error(`Zu viele Shards für ${baseId} (${chunks.length})`)
    const docId = `${baseId}${suffix}`
    await db.collection('tiles').doc(docId).set(docPayload(docId, chunks[i]!))
    written++
  }
  return written
}

/** Import: 1× lesen, nur bei Bedarf mergen — spart Deletes und Reads. */
export async function importPoisIntoGeohashTile(
  db: Firestore,
  geohashId: string,
  newPois: Poi[]
): Promise<void> {
  if (!newPois.length) return

  const baseRef = db.collection('tiles').doc(geohashId)
  const baseSnap = await baseRef.get()

  if (!baseSnap.exists) {
    const chunks = splitPoisToFit(dedupePois(newPois))
    if (chunks.length === 1) {
      await baseRef.set(docPayload(geohashId, chunks[0]!))
      return
    }
    await writeTileWithSplit(db, geohashId, newPois, { replaceExisting: false })
    return
  }

  const existing = (baseSnap.data()?.pois as Poi[]) ?? []
  await writeTileWithSplit(db, geohashId, [...existing, ...newPois])
}

const BATCH_WRITE_SIZE = 40
const BATCH_PAUSE_MS = 5_000

/** Neue Geohash-Kacheln als Batch schreiben (deutlich weniger API-Calls). */
export async function batchImportNewGeohashTiles(
  db: Firestore,
  entries: Array<{ geohashId: string; pois: Poi[] }>
): Promise<{ written: number; deferred: Array<{ geohashId: string; pois: Poi[] }> }> {
  const deferred: Array<{ geohashId: string; pois: Poi[] }> = []
  let written = 0

  for (let i = 0; i < entries.length; i += BATCH_WRITE_SIZE) {
    const slice = entries.slice(i, i + BATCH_WRITE_SIZE)
    const batch = db.batch()
    let ops = 0

    for (const { geohashId, pois } of slice) {
      const unique = dedupePois(pois)
      const chunks = splitPoisToFit(unique)
      if (chunks.length !== 1) {
        deferred.push({ geohashId, pois: unique })
        continue
      }
      batch.set(db.collection('tiles').doc(geohashId), docPayload(geohashId, chunks[0]!))
      ops++
    }

    if (ops > 0) {
      await batch.commit()
      written += ops
      if ((i / BATCH_WRITE_SIZE) % 5 === 0) {
        process.stdout.write(`\r[pbf] Batch-Writes ${Math.min(i + BATCH_WRITE_SIZE, entries.length)}/${entries.length}`)
      }
      await new Promise((r) => setTimeout(r, BATCH_PAUSE_MS))
    }
  }

  if (entries.length) process.stdout.write('\n')
  return { written, deferred }
}

export async function mergePoisIntoGeohashTile(
  db: Firestore,
  geohashId: string,
  newPois: Poi[]
): Promise<void> {
  if (!newPois.length) return
  const existing = await readTilePois(db, geohashId)
  await writeTileWithSplit(db, geohashId, [...existing, ...newPois])
}

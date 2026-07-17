/**
 * DACH POI-Import: Overpass → Geohash-5-Kacheln in Firestore
 *
 * Einmalig auf dem Entwickler-PC ausführen. Danach lädt die Web-App
 * POIs in Sekunden — ohne Overpass zur Laufzeit.
 *
 * Usage:
 *   set GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
 *   npm run import-dach-pois
 *   npm run import-dach-pois -- --region AT
 *   npm run import-dach-pois -- --limit 3
 */
import type { Poi } from '../shared/types.ts'
import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import {
  OSM_FILTERS,
  buildBboxNodeQuery,
  elementToPoi,
  type OsmElement,
} from '../src/services/osmFilters.ts'
import { initAdminDb } from './firebaseAdmin.ts'
import { dachImportTiles } from './dachTiles.ts'
import { withFirestoreRetry } from './firestoreRetry.ts'
import { dedupePois, groupPoisByGeohash, importPoisIntoGeohashTile, batchImportNewGeohashTiles } from './tileWriter.ts'

const OVERPASS_MIRRORS = [
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]
const MIN_INTERVAL_MS = 4_000
const FILTERS_PER_QUERY = 8
const MAX_RETRIES = 8
const FIRESTORE_WRITE_DELAY_MS = 100
const TILE_FAIL_COOLDOWN_MS = 15_000

let lastRequestAt = 0
let mirrorIdx = 0

function parseArgs() {
  const args = process.argv.slice(2)
  let region: string | undefined
  let limit: number | undefined

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--region' && args[i + 1]) region = args[++i]!.toUpperCase()
    if (args[i] === '--limit' && args[i + 1]) limit = Number(args[++i])
  }

  return { region, limit }
}

function initAdmin(): Firestore {
  return initAdminDb()
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function throttle(): Promise<void> {
  const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastRequestAt))
  if (wait) await sleep(wait)
  lastRequestAt = Date.now()
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size))
  }
  return out
}

async function fetchOverpassTile(
  bbox: { south: number; west: number; north: number; east: number }
): Promise<OsmElement[]> {
  const merged: OsmElement[] = []

  for (const batch of chunk(OSM_FILTERS, FILTERS_PER_QUERY)) {
    const query = buildBboxNodeQuery(bbox, batch)
    let lastError: Error | null = null

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      await throttle()
      const url = OVERPASS_MIRRORS[mirrorIdx % OVERPASS_MIRRORS.length]!
      mirrorIdx++

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
            'User-Agent': 'OnRouteFirebase/1.0 (DACH POI import)',
          },
          body: `data=${encodeURIComponent(query)}`,
          signal: AbortSignal.timeout(180_000),
        })

        if (res.status === 429 || res.status === 504 || res.status === 503 || res.status === 502) {
          lastError = new Error(`Overpass ${res.status} @ ${new URL(url).host}`)
          await sleep(8_000 * (attempt + 1))
          continue
        }

        if (!res.ok) {
          lastError = new Error(`Overpass ${res.status}`)
          await sleep(3_000)
          continue
        }

        const data = (await res.json()) as { elements?: OsmElement[] }
        merged.push(...(data.elements ?? []))
        lastError = null
        break
      } catch (err) {
        lastError = err instanceof Error ? err : new Error('Fetch fehlgeschlagen')
        await sleep(5_000 * (attempt + 1))
      }
    }

    if (lastError) throw lastError
  }

  return merged
}

async function isImportTileDone(db: Firestore, tileId: string): Promise<boolean> {
  const snap = await db.collection('importProgress').doc(tileId).get()
  return snap.exists
}

async function markImportTileDone(
  db: Firestore,
  tileId: string,
  poiCount: number
): Promise<void> {
  await db.collection('importProgress').doc(tileId).set({
    tileId,
    poiCount,
    importedAt: FieldValue.serverTimestamp(),
  })
}

async function findExistingGeohashTiles(db: Firestore, geohashIds: string[]): Promise<Set<string>> {
  const existing = new Set<string>()
  for (let i = 0; i < geohashIds.length; i += 100) {
    const chunk = geohashIds.slice(i, i + 100)
    const refs = chunk.map((id) => db.collection('tiles').doc(id))
    const snaps = await db.getAll(...refs)
    for (const snap of snaps) {
      if (snap.exists) existing.add(snap.id)
    }
  }
  return existing
}

async function countFirestoreTiles(db: Firestore): Promise<number> {
  const snap = await db.collection('tiles').count().get()
  return snap.data().count
}

async function main() {
  const { region, limit } = parseArgs()
  const db = initAdmin()
  const tiles = dachImportTiles(region)
  const toProcess = limit ? tiles.slice(0, limit) : tiles

  console.log('[import] OnRoute DACH → Firestore')
  console.log(`[import] ${toProcess.length} Overpass-Kacheln (à 1°)${region ? `, Region ${region}` : ''}`)
  if (limit) console.log(`[import] Limit: ${limit} Kacheln (Testlauf)`)
  console.log('')

  let processed = 0
  let skipped = 0
  let failed = 0
  let totalPois = 0
  const failedTiles: string[] = []

  for (const tile of toProcess) {
    if (await isImportTileDone(db, tile.id)) {
      skipped++
      continue
    }

    const attemptNo = processed + failed + 1
    const label = `[${attemptNo}/${toProcess.length - skipped}] ${tile.id}`
    process.stdout.write(`${label} Overpass… `)

    try {
      const elements = await fetchOverpassTile(tile)
      const pois = dedupePois(
        elements.map(elementToPoi).filter((p): p is NonNullable<typeof p> => !!p)
      )
      totalPois += pois.length

      const groups = groupPoisByGeohash(pois)
      process.stdout.write(`${pois.length} POIs → ${groups.size} Geohash-Kacheln… `)

      const existingIds = await findExistingGeohashTiles(db, [...groups.keys()])

      const newEntries: Array<{ geohashId: string; pois: Poi[] }> = []
      const mergeEntries: Array<{ geohashId: string; pois: Poi[] }> = []

      for (const [geohashId, groupPois] of groups) {
        if (existingIds.has(geohashId)) {
          mergeEntries.push({ geohashId, pois: groupPois })
        } else {
          newEntries.push({ geohashId, pois: groupPois })
        }
      }

      const { deferred } = await withFirestoreRetry(
        () => batchImportNewGeohashTiles(db, newEntries),
        'batch-write'
      )

      for (const { geohashId, pois: groupPois } of deferred) {
        await withFirestoreRetry(
          () => importPoisIntoGeohashTile(db, geohashId, groupPois),
          geohashId
        )
        if (FIRESTORE_WRITE_DELAY_MS) await sleep(FIRESTORE_WRITE_DELAY_MS)
      }

      for (const { geohashId, pois: groupPois } of mergeEntries) {
        await withFirestoreRetry(
          () => importPoisIntoGeohashTile(db, geohashId, groupPois),
          geohashId
        )
        if (FIRESTORE_WRITE_DELAY_MS) await sleep(FIRESTORE_WRITE_DELAY_MS)
      }

      await withFirestoreRetry(() => markImportTileDone(db, tile.id, pois.length), tile.id)
      processed++
      console.log('ok')
    } catch (err) {
      failed++
      failedTiles.push(tile.id)
      console.log('FEHLER — überspringe')
      console.error(`  ${err instanceof Error ? err.message : err}`)
      await sleep(TILE_FAIL_COOLDOWN_MS)
    }
  }

  const tileCount = await countFirestoreTiles(db)
  const progressSnap = await db.collection('importProgress').count().get()
  const importTilesDoneTotal = progressSnap.data().count

  await db.collection('meta').doc('poiImport').set({
    version: 1,
    importedAt: FieldValue.serverTimestamp(),
    tileCount,
    poiCount: totalPois,
    regions: ['AT', 'DE', 'CH', 'LI'],
    importTilesDone: processed,
    importTilesSkipped: skipped,
    importTilesFailed: failed,
    importTilesDoneTotal,
  })

  console.log('\n[import] ─────────────────────────────────────')
  console.log(`[import] Session: ${processed} Kacheln importiert, ${skipped} übersprungen, ${failed} fehlgeschlagen`)
  console.log(`[import] POIs diese Session: ${totalPois}`)
  console.log(`[import] Firestore tiles/* Dokumente: ${tileCount}`)
  console.log(`[import] importProgress gesamt: ${importTilesDoneTotal}/${dachImportTiles().length}`)
  console.log('[import] Web-App kann jetzt POIs aus Firestore laden (kein Overpass).')

  if (failedTiles.length) {
    console.log(`[import] Fehlgeschlagen (${failedTiles.length}): ${failedTiles.slice(0, 10).join(', ')}${failedTiles.length > 10 ? '…' : ''}`)
    console.log('[import] Erneut starten — fertige Kacheln werden übersprungen.')
  } else if (importTilesDoneTotal < dachImportTiles().length) {
    console.log('[import] Noch nicht alle Kacheln fertig — Import erneut ausführen.')
  } else {
    console.log('[import] ✓ DACH-Import vollständig.')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

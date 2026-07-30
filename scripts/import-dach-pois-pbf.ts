/**
 * POI-Import aus Geofabrik-PBF → Supabase
 *
 * Usage:
 *   npm run import-dach-pois-pbf
 *   npm run import-dach-pois-pbf -- --region LU
 *   npm run import-dach-pois-pbf -- --skip-download
 *   npm run import-dach-pois-pbf -- --force --skip-download
 */
import { createReadStream, createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable, Transform } from 'node:stream'
import type { Poi } from '../shared/types.ts'
import { IMPORT_REGION_CODES, IMPORT_REGIONS } from '../shared/regions.ts'
import { OSM_FILTERS, elementToPoi, type OsmElement } from '../src/services/osmFilters.ts'
import { dachImportTiles } from './dachTiles.ts'
import { initSupabaseAdmin } from './supabaseAdmin.ts'
import {
  countTiles,
  clearRegionDone,
  dedupePois,
  isRegionDone,
  markRegionDone,
  setImportMeta,
  writePoisToSupabase,
} from './tileWriterSupabase.ts'

const require = createRequire(import.meta.url)
const parseOSM = require('osm-pbf-parser') as () => NodeJS.ReadWriteStream

const DATA_DIR = resolve('data/geofabrik')
const GEOFABRIK_BASE = 'https://download.geofabrik.de'

const EXTRACTS = Object.fromEntries(
  IMPORT_REGIONS.map((r) => [
    r.code,
    { url: `${GEOFABRIK_BASE}/${r.geofabrikPath}`, file: r.file },
  ])
) as Record<string, { url: string; file: string }>

function parseArgs() {
  const args = process.argv.slice(2)
  let region: string | undefined
  let skipDownload = false
  let force = false

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--region' && args[i + 1]) region = args[++i]!.toUpperCase()
    if (args[i] === '--skip-download') skipDownload = true
    if (args[i] === '--force') force = true
  }

  return { region, skipDownload, force }
}

async function downloadExtract(region: string, skipDownload: boolean): Promise<string> {
  const extract = EXTRACTS[region]
  if (!extract) throw new Error(`Unbekannte Region: ${region}`)

  mkdirSync(DATA_DIR, { recursive: true })
  const dest = join(DATA_DIR, extract.file)

  if (existsSync(dest)) {
    const mb = (statSync(dest).size / 1e6).toFixed(1)
    console.log(`[pbf] ${region}: lokale Datei vorhanden (${mb} MB) → ${dest}`)
    return dest
  }

  if (skipDownload) {
    throw new Error(`--skip-download, aber Datei fehlt: ${dest}`)
  }

  console.log(`[pbf] ${region}: Download ${extract.url}`)
  const res = await fetch(extract.url, {
    headers: { 'User-Agent': 'OnRouteFirebase/1.0 (Geofabrik PBF to Supabase)' },
    redirect: 'follow',
  })
  if (!res.ok || !res.body) {
    throw new Error(`Download fehlgeschlagen: HTTP ${res.status}`)
  }

  const total = Number(res.headers.get('content-length') ?? 0)
  let received = 0
  let lastLog = 0

  const out = createWriteStream(dest)
  const progress = new Transform({
    transform(chunk, _enc, cb) {
      received += chunk.length
      const now = Date.now()
      if (now - lastLog > 2_000) {
        lastLog = now
        const pct = total ? ` ${((received / total) * 100).toFixed(1)}%` : ''
        process.stdout.write(
          `\r[pbf] ${region}: ${(received / 1e6).toFixed(1)} MB${pct} geladen…`
        )
      }
      cb(null, chunk)
    },
  })

  await pipeline(Readable.fromWeb(res.body as import('node:stream/web').ReadableStream), progress, out)
  process.stdout.write('\n')
  console.log(`[pbf] ${region}: Download fertig → ${dest}`)
  return dest
}

const WAY_OSM_FILTERS = OSM_FILTERS.filter((f) => f.includeWays)

function matchFilterTags(tags: Record<string, string> | undefined): boolean {
  if (!tags) return false
  return OSM_FILTERS.some((f) => tags[f.key] === f.value)
}

function matchWayFilterTags(tags: Record<string, string> | undefined): boolean {
  if (!tags || WAY_OSM_FILTERS.length === 0) return false
  return WAY_OSM_FILTERS.some((f) => tags[f.key] === f.value)
}

type PendingWay = { id: number; tags: Record<string, string>; refs: number[] }

function forEachPbfItem(
  filePath: string,
  onItem: (item: OsmElement) => void,
  onProgress?: (nodes: number) => void
): Promise<void> {
  let nodes = 0
  let lastLog = Date.now()

  return new Promise<void>((resolvePromise, reject) => {
    const osm = parseOSM()

    createReadStream(filePath)
      .pipe(osm)
      .pipe(
        new Transform({
          objectMode: true,
          transform(items: OsmElement[], _enc, cb) {
            for (const item of items) {
              if (item.type === 'node') {
                nodes++
                if (onProgress && Date.now() - lastLog > 3_000) {
                  lastLog = Date.now()
                  onProgress(nodes)
                }
              }
              onItem(item)
            }
            cb()
          },
        })
      )
      .on('finish', () => resolvePromise())
      .on('error', reject)

    osm.on('error', reject)
  })
}

/**
 * Nodes for all OSM_FILTERS + centroids for includeWays filters (e.g. cemeteries).
 * Ways need a second pass so only referenced node coords stay in memory.
 */
async function extractPoisFromPbf(filePath: string): Promise<Poi[]> {
  const pois: Poi[] = []
  const pendingWays: PendingWay[] = []
  const neededNodeIds = new Set<number>()
  let matchedNodes = 0

  await forEachPbfItem(
    filePath,
    (item) => {
      if (item.type === 'node') {
        if (!matchFilterTags(item.tags)) return
        const poi = elementToPoi(item)
        if (!poi) return
        matchedNodes++
        pois.push(poi)
        return
      }

      if (item.type !== 'way' || !matchWayFilterTags(item.tags)) return
      const refs = item.refs ?? []
      if (refs.length === 0) return
      pendingWays.push({ id: item.id, tags: item.tags!, refs })
      for (const ref of refs) neededNodeIds.add(ref)
    },
    (nodes) => {
      process.stdout.write(
        `\r[pbf] Pass 1… ${nodes.toLocaleString('de-DE')} Nodes, ${matchedNodes.toLocaleString('de-DE')} POIs, ${pendingWays.length.toLocaleString('de-DE')} Ways`
      )
    }
  )

  process.stdout.write(
    `\r[pbf] Pass 1 fertig: ${matchedNodes.toLocaleString('de-DE')} Node-POIs, ${pendingWays.length.toLocaleString('de-DE')} Ways\n`
  )

  if (pendingWays.length === 0) return dedupePois(pois)

  const coords = new Map<number, { lat: number; lon: number }>()
  await forEachPbfItem(
    filePath,
    (item) => {
      if (item.type !== 'node') return
      if (!neededNodeIds.has(item.id)) return
      if (item.lat == null || item.lon == null) return
      coords.set(item.id, { lat: item.lat, lon: item.lon })
    },
    (nodes) => {
      process.stdout.write(
        `\r[pbf] Pass 2… ${nodes.toLocaleString('de-DE')} Nodes, ${coords.size.toLocaleString('de-DE')}/${neededNodeIds.size.toLocaleString('de-DE')} Way-Refs`
      )
    }
  )
  process.stdout.write(
    `\r[pbf] Pass 2 fertig: ${coords.size.toLocaleString('de-DE')} Way-Node-Koordinaten\n`
  )

  let matchedWays = 0
  for (const way of pendingWays) {
    let latSum = 0
    let lonSum = 0
    let n = 0
    for (const ref of way.refs) {
      const c = coords.get(ref)
      if (!c) continue
      latSum += c.lat
      lonSum += c.lon
      n++
    }
    if (n === 0) continue
    const poi = elementToPoi({
      type: 'way',
      id: way.id,
      tags: way.tags,
      center: { lat: latSum / n, lon: lonSum / n },
    })
    if (!poi) continue
    matchedWays++
    pois.push(poi)
  }

  console.log(`[pbf] Way-POIs (Centroids): ${matchedWays.toLocaleString('de-DE')}`)
  return dedupePois(pois)
}

async function main() {
  const { region, skipDownload, force } = parseArgs()
  const sb = initSupabaseAdmin()
  const regions = region ? [region] : [...IMPORT_REGION_CODES]

  console.log('[pbf] OnRoute ← Geofabrik PBF → Supabase')
  console.log(`[pbf] Regionen: ${regions.join(', ')}`)
  if (force) console.log('[pbf] --force: bereits importierte Regionen werden neu geschrieben')
  console.log('')

  let sessionPois = 0
  let importedRegions = 0
  let skippedRegions = 0
  let hoursTagged = 0

  for (const r of regions) {
    if (!(r in EXTRACTS)) {
      console.error(`[pbf] Unbekannte Region ${r}, überspringe`)
      continue
    }

    if (!force && (await isRegionDone(sb, r))) {
      console.log(`[pbf] ${r}: bereits importiert (pbf_${r}) — überspringe`)
      skippedRegions++
      continue
    }

    if (force && (await isRegionDone(sb, r))) {
      await clearRegionDone(sb, r)
      console.log(`[pbf] ${r}: Done-Marker gelöscht (--force)`)
    }

    const filePath = await downloadExtract(r, skipDownload)
    const extracted = await extractPoisFromPbf(filePath)
    const def = IMPORT_REGIONS.find((x) => x.code === r)
    // Shared extracts (z. B. IE/NI) auf Region-BBox begrenzen, sonst Doppelzählung.
    const sharesFile =
      !!def && IMPORT_REGIONS.filter((x) => x.file === def.file).length > 1
    const pois =
      sharesFile && def
        ? extracted.filter(
            (p) =>
              p.lat >= def.south &&
              p.lat <= def.north &&
              p.lng >= def.west &&
              p.lng <= def.east
          )
        : extracted
    if (sharesFile && extracted.length !== pois.length) {
      console.log(
        `[pbf] ${r}: BBox-Filter ${extracted.length} → ${pois.length} POIs (geteilter Extract)`
      )
    }
    const withHours = pois.filter((p) => p.openingHours).length
    hoursTagged += withHours
    await writePoisToSupabase(sb, pois)
    await markRegionDone(
      sb,
      r,
      pois.length,
      dachImportTiles(r).map((t) => t.id)
    )

    sessionPois += pois.length
    importedRegions++
    console.log(`[pbf] ${r}: ok (${pois.length} POIs, davon ${withHours} mit opening_hours)\n`)
  }

  // Meta/Summary darf den Import nicht killen — POIs + Done-Marker sind schon geschrieben.
  let tileCount: number | null = null
  let progressCount: number | null = null
  try {
    tileCount = await countTiles(sb)
    const progress = await sb
      .from('import_progress')
      .select('id', { count: 'estimated', head: true })
    if (progress.error) {
      console.warn(`[pbf] import_progress count: ${progress.error.message}`)
    } else {
      progressCount = progress.count ?? 0
    }

    await setImportMeta(sb, {
      version: 5,
      source: 'geofabrik-pbf-supabase',
      importedAt: new Date().toISOString(),
      tileCount,
      poiCount: sessionPois,
      regions: [...IMPORT_REGION_CODES],
      importRegionsDone: importedRegions,
      importRegionsSkipped: skippedRegions,
      importTilesDoneTotal: progressCount ?? 0,
      openingHoursTagged: hoursTagged,
    })
  } catch (err) {
    console.warn('[pbf] Session-Meta übersprungen:', err instanceof Error ? err.message : err)
  }

  console.log('[pbf] ─────────────────────────────────────')
  console.log(`[pbf] Session: ${importedRegions} Regionen, ${skippedRegions} übersprungen`)
  console.log(`[pbf] POIs diese Session: ${sessionPois}`)
  console.log(`[pbf] davon mit opening_hours: ${hoursTagged}`)
  console.log(`[pbf] Supabase tiles: ${tileCount ?? 'n/a'}`)
  console.log(`[pbf] import_progress rows: ${progressCount ?? 'n/a'}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

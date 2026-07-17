/**
 * DACH POI-Import aus Geofabrik-PBF → Supabase
 *
 * Usage:
 *   npm run import-dach-pois-pbf
 *   npm run import-dach-pois-pbf -- --region AT
 *   npm run import-dach-pois-pbf -- --skip-download
 */
import { createReadStream, createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable, Transform } from 'node:stream'
import type { Poi } from '../shared/types.ts'
import { OSM_FILTERS, elementToPoi, type OsmElement } from '../src/services/osmFilters.ts'
import { dachImportTiles } from './dachTiles.ts'
import { initSupabaseAdmin } from './supabaseAdmin.ts'
import {
  countTiles,
  dedupePois,
  isRegionDone,
  markRegionDone,
  setImportMeta,
  writePoisToSupabase,
} from './tileWriterSupabase.ts'

const require = createRequire(import.meta.url)
const parseOSM = require('osm-pbf-parser') as () => NodeJS.ReadWriteStream

const DATA_DIR = resolve('data/geofabrik')

const EXTRACTS: Record<string, { url: string; file: string }> = {
  AT: {
    url: 'https://download.geofabrik.de/europe/austria-latest.osm.pbf',
    file: 'austria-latest.osm.pbf',
  },
  CH: {
    url: 'https://download.geofabrik.de/europe/switzerland-latest.osm.pbf',
    file: 'switzerland-latest.osm.pbf',
  },
  LI: {
    url: 'https://download.geofabrik.de/europe/liechtenstein-latest.osm.pbf',
    file: 'liechtenstein-latest.osm.pbf',
  },
  DE: {
    url: 'https://download.geofabrik.de/europe/germany-latest.osm.pbf',
    file: 'germany-latest.osm.pbf',
  },
}

function parseArgs() {
  const args = process.argv.slice(2)
  let region: string | undefined
  let skipDownload = false

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--region' && args[i + 1]) region = args[++i]!.toUpperCase()
    if (args[i] === '--skip-download') skipDownload = true
  }

  return { region, skipDownload }
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
    headers: { 'User-Agent': 'OnRouteFirebase/1.0 (Geofabrik PBF → Supabase)' },
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

function matchFilterTags(tags: Record<string, string> | undefined): boolean {
  if (!tags) return false
  return OSM_FILTERS.some((f) => tags[f.key] === f.value)
}

async function extractPoisFromPbf(filePath: string): Promise<Poi[]> {
  const pois: Poi[] = []
  let nodes = 0
  let matched = 0
  let lastLog = Date.now()

  await new Promise<void>((resolvePromise, reject) => {
    const osm = parseOSM()

    createReadStream(filePath)
      .pipe(osm)
      .pipe(
        new Transform({
          objectMode: true,
          transform(items: OsmElement[], _enc, cb) {
            for (const item of items) {
              if (item.type !== 'node') continue
              nodes++
              if (!matchFilterTags(item.tags)) continue
              const poi = elementToPoi(item)
              if (!poi) continue
              matched++
              pois.push(poi)
            }

            const now = Date.now()
            if (now - lastLog > 3_000) {
              lastLog = now
              process.stdout.write(
                `\r[pbf] Parse… ${nodes.toLocaleString('de-DE')} Nodes, ${matched.toLocaleString('de-DE')} POIs`
              )
            }
            cb()
          },
          flush(cb) {
            process.stdout.write(
              `\r[pbf] Parse fertig: ${nodes.toLocaleString('de-DE')} Nodes, ${matched.toLocaleString('de-DE')} POIs\n`
            )
            cb()
          },
        })
      )
      .on('finish', () => resolvePromise())
      .on('error', reject)

    osm.on('error', reject)
  })

  return dedupePois(pois)
}

async function main() {
  const { region, skipDownload } = parseArgs()
  const sb = initSupabaseAdmin()
  const regions = region ? [region] : ['AT', 'CH', 'LI', 'DE']

  console.log('[pbf] OnRoute DACH ← Geofabrik PBF → Supabase')
  console.log(`[pbf] Regionen: ${regions.join(', ')}`)
  console.log('')

  let sessionPois = 0
  let importedRegions = 0
  let skippedRegions = 0

  for (const r of regions) {
    if (!(r in EXTRACTS)) {
      console.error(`[pbf] Unbekannte Region ${r}, überspringe`)
      continue
    }

    if (await isRegionDone(sb, r)) {
      console.log(`[pbf] ${r}: bereits importiert (pbf_${r}) — überspringe`)
      skippedRegions++
      continue
    }

    const filePath = await downloadExtract(r, skipDownload)
    const pois = await extractPoisFromPbf(filePath)
    await writePoisToSupabase(sb, pois)
    await markRegionDone(
      sb,
      r,
      pois.length,
      dachImportTiles(r).map((t) => t.id)
    )

    sessionPois += pois.length
    importedRegions++
    console.log(`[pbf] ${r}: ok (${pois.length} POIs)\n`)
  }

  const tileCount = await countTiles(sb)
  const { count: progressCount } = await sb
    .from('import_progress')
    .select('*', { count: 'exact', head: true })

  await setImportMeta(sb, {
    version: 3,
    source: 'geofabrik-pbf-supabase',
    importedAt: new Date().toISOString(),
    tileCount,
    poiCount: sessionPois,
    regions: ['AT', 'DE', 'CH', 'LI'],
    importRegionsDone: importedRegions,
    importRegionsSkipped: skippedRegions,
    importTilesDoneTotal: progressCount ?? 0,
  })

  console.log('[pbf] ─────────────────────────────────────')
  console.log(`[pbf] Session: ${importedRegions} Regionen, ${skippedRegions} übersprungen`)
  console.log(`[pbf] POIs diese Session: ${sessionPois}`)
  console.log(`[pbf] Supabase tiles: ${tileCount}`)
  console.log(`[pbf] import_progress rows: ${progressCount ?? 0}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

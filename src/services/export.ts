import type { Poi, RoutePoint } from '../../shared/types'
import { tGlobal } from '../i18n'
import { poiCategoryPrintSvg } from '../utils/poiLabels'

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** GPX coords: 6 decimals (~0.1 m) — avoids float noise that breaks some importers. */
function fmtCoord(n: number): string {
  return n.toFixed(6)
}

function fmtEle(n: number): string {
  return n.toFixed(1)
}

/** Short category for bike-computer screens (Wahoo/Garmin). */
function shortCategoryLabel(category: string): string {
  const key = `export.catShort.${category}`
  const translated = tGlobal(key)
  return translated === key ? category : translated
}

/**
 * Compact waypoint label for devices (~20 chars): "Wasser" / "Spar" / custom name.
 * Distance is shown separately on Edge/ELEMNT — don't prefix km here.
 * Custom favorite names are applied upstream via labeledFavorites() → poi.name.
 */
export function deviceWaypointName(poi: Poi): string {
  const raw = (poi.name || '').trim()
  const body = raw || shortCategoryLabel(poi.category)
  const maxBody = 20
  return body.length > maxBody ? `${body.slice(0, maxBody - 1)}…` : body
}

export type GpxExportOptions = {
  /** Embed UltraPlaner ★ markers for re-import (default true when waypoints present). */
  markFavorites?: boolean
}

/** Export route + optional waypoints as GPX 1.1 string. */
export function buildGpxExport(
  name: string,
  routePoints: RoutePoint[],
  waypoints: Poi[] = [],
  options: GpxExportOptions = {}
): string {
  const now = new Date().toISOString()
  const markFavorites = options.markFavorites ?? waypoints.length > 0

  const wptLines = waypoints.map((p) => {
    const rawName = deviceWaypointName(p)
    const wptName = escapeXml(rawName)
    const sym = gpxSymbol(p.category)
    const distM = Math.round((p.distanceAlongRouteKm ?? 0) * 1000)
    const type = gpxType(p.category)
    // Wahoo often shows <cmt>/<desc> in the waypoint list — same text as <name>
    const note = (p as Poi & { note?: string }).note?.trim()
    const cmt = escapeXml(note ? `${rawName} · ${note}` : rawName)
    const extensions = markFavorites
      ? [
          '    <extensions>',
          '      <up:favorite>true</up:favorite>',
          `      <up:distanceFromStart>${distM}</up:distanceFromStart>`,
          `      <up:category>${escapeXml(p.category)}</up:category>`,
          `      <up:osmId>${escapeXml(p.id)}</up:osmId>`,
          '    </extensions>',
        ]
      : []
    return [
      `  <wpt lat="${fmtCoord(p.lat)}" lon="${fmtCoord(p.lng)}">`,
      `    <name>${wptName}</name>`,
      `    <cmt>${cmt}</cmt>`,
      `    <desc>${cmt}</desc>`,
      `    <sym>${sym}</sym>`,
      `    <type>${escapeXml(type)}</type>`,
      ...extensions,
      `  </wpt>`,
    ].join('\n')
  })

  const trkptLines = routePoints.map((p) => {
    const ele = p.elevation != null ? `<ele>${fmtEle(p.elevation)}</ele>` : ''
    return `      <trkpt lat="${fmtCoord(p.lat)}" lon="${fmtCoord(p.lng)}">${ele}</trkpt>`
  })

  // Note: do not put favorites as the only shape — Strava Routes often draw wpt-to-wpt
  // and ignore the dense track. Prefer track-only GPX for Strava (exportGpxRoute).
  const gpxOpen = markFavorites
    ? '<gpx version="1.1" creator="UltraPlaner" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:up="https://ultraplaner.com/gpx/1" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">'
    : '<gpx version="1.1" creator="UltraPlaner" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">'

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    gpxOpen,
    `  <metadata><name>${escapeXml(name)}</name><time>${now}</time></metadata>`,
    ...wptLines,
    '  <trk>',
    `    <name>${escapeXml(name)}</name>`,
    '    <type>cycling</type>',
    '    <trkseg>',
    ...trkptLines,
    '    </trkseg>',
    '  </trk>',
    '</gpx>',
  ].join('\n')
}

function gpxSymbol(category: string): string {
  const map: Record<string, string> = {
    fuel: 'Car',
    supermarket: 'Grocery Store',
    gastronomy: 'Restaurant',
    beverages: 'Grocery Store',
    water: 'Drinking Water',
    hotel: 'Lodge',
    campsite: 'Campground',
    bike: 'Bicycle Trail',
    checkpoint: 'Flag',
    sleep: 'Lodging',
    border: 'Pin',
  }
  return map[category] ?? 'Waypoint'
}

function gpxType(category: string): string {
  const map: Record<string, string> = {
    fuel: 'Fuel',
    supermarket: 'Supermarket',
    gastronomy: 'Food',
    beverages: 'Store',
    water: 'Water',
    hotel: 'Hotel',
    campsite: 'Campground',
    bike: 'Bike Shop',
    checkpoint: 'Checkpoint',
    sleep: 'Sleep',
    border: 'Border',
  }
  return map[category] ?? 'Waypoint'
}

// ── Print Sheet ──────────────────────────────────────────────────────────────

export type PrintFavorite = Poi & {
  /** Display name (custom or OSM) */
  label?: string
  note?: string
  /** ETA clock or duration, e.g. "14:32" or "6h 20m" */
  etaLabel?: string
  /** Open/closed/unknown at ETA, already localized */
  hoursLabel?: string
  hoursStatus?: 'open' | 'closed' | 'unknown'
}

export type PrintFavoritesOptions = {
  nightContrast?: boolean
  /** Optional header line under title, e.g. speed · start */
  metaLine?: string
}

/**
 * Opens a narrow stem-mount printable strip (42 mm).
 * Spickzettel 2.0: km · ETA · open? · name · note
 */
export function printFavoritesSheet(
  _routeName: string,
  _totalKm: number,
  pois: PrintFavorite[],
  options: PrintFavoritesOptions = {}
): void {
  if (pois.length === 0) {
    alert(tGlobal('export.noFavorites'))
    return
  }

  const printWindow = window.open('about:blank', '_blank')
  if (!printWindow) {
    alert(tGlobal('export.popupBlocked'))
    return
  }

  const sorted = [...pois].sort(
    (a, b) => (a.distanceAlongRouteKm ?? 0) - (b.distanceAlongRouteKm ?? 0)
  )

  const STRIP_MM = 42
  const night = !!options.nightContrast
  const meta = (options.metaLine ?? '').trim()

  const rows = sorted
    .map((p) => {
      const km = Math.round(p.distanceAlongRouteKm ?? 0)
      const icon = poiCategoryPrintSvg(p.category)
      const name = (p.label || p.name || tGlobal('export.favorite')).slice(0, 28)
      const eta = (p.etaLabel ?? '').trim()
      const hours = (p.hoursLabel ?? '').trim()
      const note = (p.note ?? '').trim().slice(0, 40)
      const metaBits = [eta, hours].filter(Boolean).join(' · ')
      const metaHtml = metaBits
        ? `<div class="meta${p.hoursStatus === 'closed' ? ' closed' : ''}">${escapeXml(metaBits)}</div>`
        : ''
      const noteHtml = note
        ? `<div class="note">${escapeXml(note)}</div>`
        : ''
      return `<div class="row">
        <div class="main"><span class="km">${km}km</span>${icon}<span class="name">${escapeXml(name)}</span></div>
        ${metaHtml}
        ${noteHtml}
      </div>`
    })
    .join('\n')

  const headerHtml = meta
    ? `<div class="sheet-meta">${escapeXml(meta)}</div>`
    : ''

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<title></title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    color: ${night ? '#fff' : '#000'};
    background: ${night ? '#000' : '#fff'};
    width: ${STRIP_MM}mm;
    max-width: ${STRIP_MM}mm;
    padding: 1mm;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sheet-meta {
    font-size: 6.5pt;
    font-weight: 600;
    line-height: 1.2;
    margin-bottom: 0.8mm;
    padding-bottom: 0.6mm;
    border-bottom: ${night ? '0.6pt solid #fff' : '0.25pt solid #999'};
    opacity: 0.9;
  }
  .row {
    padding: 0.65mm 0;
    border-bottom: ${night ? '0.5pt solid #fff' : '0.25pt solid #ccc'};
  }
  .row:last-child { border-bottom: none; }
  .main {
    display: flex;
    align-items: center;
    gap: 1.2mm;
    font-size: 10pt;
    font-weight: 800;
    line-height: 1.2;
  }
  .km {
    flex: 0 0 auto;
    font-variant-numeric: tabular-nums;
  }
  .ico {
    flex: 0 0 auto;
    display: block;
    width: 3.2mm;
    height: 3.2mm;
    ${night ? 'filter: invert(1);' : ''}
  }
  .name {
    flex: 1 1 auto;
    min-width: 0;
    word-break: break-word;
  }
  .meta {
    font-size: 7pt;
    font-weight: 700;
    line-height: 1.15;
    margin-top: 0.25mm;
    font-variant-numeric: tabular-nums;
  }
  .meta.closed { ${night ? 'text-decoration: underline;' : 'color: #b91c1c;'} }
  .note {
    font-size: 6.5pt;
    font-weight: 500;
    line-height: 1.15;
    margin-top: 0.2mm;
    color: ${night ? '#ddd' : '#222'};
    word-break: break-word;
  }
  @media print {
    body { padding: 0; width: ${STRIP_MM}mm; }
    @page {
      size: ${STRIP_MM}mm auto;
      margin: 1.5mm;
    }
  }
</style>
</head>
<body>
  ${headerHtml}
  ${rows}
</body>
</html>`

  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
  printWindow.focus()

  let printed = false
  const triggerPrint = () => {
    if (printed || printWindow.closed) return
    printed = true
    printWindow.print()
  }
  printWindow.addEventListener('load', triggerPrint, { once: true })
  setTimeout(triggerPrint, 400)
}

/** Trigger a file download in the browser. */
export function downloadFile(filename: string, content: string, mimeType = 'application/gpx+xml'): void {
  const blob = new Blob([content], { type: mimeType })
  void shareOrDownloadBlob(filename, blob, mimeType)
}

/** Trigger a binary file download (e.g. FIT). */
export function downloadBinary(
  filename: string,
  data: Uint8Array,
  mimeType = 'application/octet-stream'
): void {
  const copy = new Uint8Array(data.byteLength)
  copy.set(data)
  const blob = new Blob([copy], { type: mimeType })
  void shareOrDownloadBlob(filename, blob, mimeType)
}

/**
 * On iOS, prefer the native share sheet (Files / AirDrop) — `<a download>` is unreliable.
 * Falls back to classic download elsewhere.
 */
export async function shareOrDownloadBlob(
  filename: string,
  blob: Blob,
  mimeType: string
): Promise<void> {
  const file = new File([blob], filename, { type: mimeType })
  const nav = typeof navigator !== 'undefined' ? navigator : null
  const canShareFiles =
    !!nav &&
    typeof nav.canShare === 'function' &&
    typeof nav.share === 'function' &&
    nav.canShare({ files: [file] })

  if (canShareFiles) {
    try {
      await nav!.share({ files: [file], title: filename })
      return
    } catch (err) {
      // User cancelled share — don't fall through to a surprise download.
      if (err instanceof DOMException && err.name === 'AbortError') return
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

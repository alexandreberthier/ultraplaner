import type { Poi, RoutePoint } from '../../shared/types'
import { etaAtKm } from '../utils/eta'

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Export route + optional waypoints as GPX string. */
export function buildGpxExport(
  name: string,
  routePoints: RoutePoint[],
  waypoints: Poi[] = []
): string {
  const now = new Date().toISOString()

  const wptLines = waypoints.map((p) => {
    const wptName = escapeXml(p.name)
    const sym = gpxSymbol(p.category)
    return [
      `  <wpt lat="${p.lat}" lon="${p.lng}">`,
      `    <name>${wptName}</name>`,
      `    <sym>${sym}</sym>`,
      `  </wpt>`,
    ].join('\n')
  })

  const trkptLines = routePoints.map((p) => {
    const ele = p.elevation != null ? `<ele>${p.elevation.toFixed(1)}</ele>` : ''
    return `      <trkpt lat="${p.lat}" lon="${p.lng}">${ele}</trkpt>`
  })

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="UltraPlaner" xmlns="http://www.topografix.com/GPX/1/1">',
    `  <metadata><name>${escapeXml(name)}</name><time>${now}</time></metadata>`,
    ...wptLines,
    '  <trk>',
    `    <name>${escapeXml(name)}</name>`,
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
    food: 'Grocery Store',
    restaurant: 'Restaurant',
    water: 'Drinking Water',
    hotel: 'Lodge',
    campsite: 'Campground',
    bike: 'Bicycle Trail',
  }
  return map[category] ?? 'Waypoint'
}

// ── Print Sheet ──────────────────────────────────────────────────────────────

const CATEGORY_EMOJI: Record<string, string> = {
  fuel: '⛽',
  food: '🛒',
  water: '💧',
  restaurant: '🍽️',
  bike: '🔧',
  hotel: '🏨',
  campsite: '⛺',
}

const CATEGORY_LABEL: Record<string, string> = {
  fuel: 'Tankstelle',
  food: 'Essen',
  water: 'Wasser',
  restaurant: 'Restaurant',
  bike: 'Rad',
  hotel: 'Hotel',
  campsite: 'Camping',
}

/**
 * Opens a new tab with a printable cheat-sheet of the given POIs,
 * sorted by km position. Optional QR code links back to the online map.
 */
export async function printFavoritesSheet(
  routeName: string,
  totalKm: number,
  pois: Poi[],
  shareUrl?: string,
  eta?: { avgSpeedKmh: number; startTimeHHmm: string }
): Promise<void> {
  if (pois.length === 0) {
    alert('Noch keine Favoriten markiert. POI antippen → ★ Favorit.')
    return
  }

  // Window must open synchronously on click — before any await.
  const printWindow = window.open('about:blank', '_blank')
  if (!printWindow) {
    alert('Popup wurde blockiert – bitte Popups für diese Seite erlauben.')
    return
  }

  printWindow.document.write(`<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><title>Spickzettel…</title></head>
<body style="font-family:sans-serif;padding:2rem;color:#333">
  <p>Spickzettel wird erstellt…</p>
</body></html>`)
  printWindow.document.close()

  let qrImg = ''
  if (shareUrl) {
    try {
      const QRCode = (await import('qrcode')).default
      const dataUrl = await QRCode.toDataURL(shareUrl, { width: 96, margin: 1, errorCorrectionLevel: 'M' })
      qrImg = `<div class="qr-block">
        <img src="${dataUrl}" alt="QR-Code" width="72" height="72" />
        <p>Online-Karte<br>scannen</p>
      </div>`
    } catch {
      qrImg = ''
    }
  }

  const sorted = [...pois].sort(
    (a, b) => (a.distanceAlongRouteKm ?? 0) - (b.distanceAlongRouteKm ?? 0)
  )

  const finishEta = eta
    ? etaAtKm(totalKm, eta.avgSpeedKmh, eta.startTimeHHmm)
    : null

  const rows = sorted
    .map((p) => {
      const km = (p.distanceAlongRouteKm ?? 0).toFixed(1)
      const dist = Math.round(p.distanceToRouteM ?? 0)
      const emoji = CATEGORY_EMOJI[p.category] ?? '📍'
      const label = CATEGORY_LABEL[p.category] ?? p.category
      const name = p.name || '–'
      const distStr = dist > 0 ? `${dist} m` : '–'
      const poiEta = eta
        ? etaAtKm(p.distanceAlongRouteKm ?? 0, eta.avgSpeedKmh, eta.startTimeHHmm)
        : null
      const etaCell = poiEta?.clockLabel ?? poiEta?.durationLabel ?? '–'
      return `<tr>
        <td class="km">km ${km}</td>
        <td class="eta">${etaCell}</td>
        <td class="cat">${emoji} ${label}</td>
        <td class="name">${escapeXml(name)}</td>
        <td class="dist">${distStr}</td>
      </tr>`
    })
    .join('\n')

  const etaMeta = eta
    ? ` · ${eta.avgSpeedKmh} km/h ab ${eta.startTimeHHmm}${
        finishEta?.clockLabel ? ` · Ziel ${finishEta.clockLabel}` : ''
      }`
    : ''

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>UltraPlaner – ${escapeXml(routeName)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, Arial, sans-serif;
    font-size: 11px;
    color: #111;
    background: #fff;
    padding: 12mm 10mm;
  }
  h1 {
    font-size: 14px;
    margin-bottom: 4px;
  }
  .meta {
    font-size: 10px;
    color: #555;
    margin-bottom: 10px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th {
    text-align: left;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: .05em;
    color: #888;
    border-bottom: 2px solid #111;
    padding: 3px 4px;
  }
  td {
    padding: 4px 4px;
    border-bottom: 1px solid #e5e5e5;
    vertical-align: top;
  }
  tr:nth-child(even) td { background: #f9f9f9; }
  .km  { white-space: nowrap; font-weight: 700; width: 60px; }
  .eta { white-space: nowrap; font-weight: 700; width: 52px; }
  .cat { white-space: nowrap; width: 100px; }
  .name { }
  .dist { white-space: nowrap; width: 52px; text-align: right; color: #555; }
  .footer {
    margin-top: 8px;
    font-size: 9px;
    color: #aaa;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
  }
  .footer-note { flex: 1; text-align: right; }
  .qr-block {
    text-align: center;
    flex-shrink: 0;
  }
  .qr-block img {
    display: block;
    margin: 0 auto 2px;
  }
  .qr-block p {
    font-size: 8px;
    color: #555;
    line-height: 1.2;
  }
  @media print {
    body { padding: 0; }
    @page { size: A5 landscape; margin: 8mm; }
  }
</style>
</head>
<body>
  <h1>🚲 ${escapeXml(routeName)}</h1>
  <p class="meta">${sorted.length} Favoriten · ${Math.round(totalKm)} km Gesamtstrecke${etaMeta} · Stand: ${new Date().toLocaleDateString('de-AT')}</p>
  <table>
    <thead>
      <tr>
        <th>km</th>
        <th>ETA</th>
        <th>Typ</th>
        <th>Name</th>
        <th style="text-align:right">Abstand</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  <p class="footer">
    ${qrImg}
    <span class="footer-note">UltraPlaner · km-Markierungen alle 25 km</span>
  </p>
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
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Export as CSV: km, name, category, distanceToRoute */
export function buildCsvExport(_name: string, pois: Poi[]): string {
  const header = 'km,name,category,distanz_zur_route_m,lat,lng'
  const rows = pois.map((p) =>
    [
      (p.distanceAlongRouteKm ?? 0).toFixed(2),
      `"${p.name.replace(/"/g, '""')}"`,
      p.category,
      Math.round(p.distanceToRouteM ?? 0),
      p.lat.toFixed(6),
      p.lng.toFixed(6),
    ].join(',')
  )
  return [header, ...rows].join('\n')
}

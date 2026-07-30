import type { PoiCategory } from '../../shared/types'
import type { Map as MaplibreMap } from 'maplibre-gl'
import { poiCategoryIconSvgInner } from './poiLabels'

/**
 * Crisp map icons: baked filled silhouettes at exact display size.
 *
 * Blur root causes (previous):
 * - Thin stroke/outline paths → antialias mush at ~16 CSS px
 * - icon-size 0.5 → MapLibre resamples/downscales (soft edges)
 * - Oversized canvas (128 @ PR 4) then fractional scale
 *
 * Fix: solid fills + canvas = logicalPx × pixelRatio + icon-size 1 (integer).
 */
const LOGICAL_PX = 16
/** Fixed integer ratio — matches retina without fractional CSS size. */
const PIXEL_RATIO = 3
const CANVAS_PX = LOGICAL_PX * PIXEL_RATIO // 48
const VIEW = 20

/** MapLibre image id for a POI category (filled black silhouette). */
export function poiCategoryIconId(category: PoiCategory | string): string {
  return `poi-icon-${category}`
}

function makeCanvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d', { alpha: true, willReadFrequently: true })
  if (!ctx) throw new Error('2d context unavailable')
  // Path fills still AA; disable drawImage smoothing if we ever blit bitmaps
  ctx.imageSmoothingEnabled = false
  return { canvas, ctx }
}

/** Paint filled SVG path/circle markup (viewBox 0 0 20 20) onto a transparent canvas. */
function drawCategoryIcon(category: string, size = CANVAS_PX): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(size)
  // Integer inset in canvas px so edges aren't clipped; keep scale clean
  const pad = 3
  const s = (size - pad * 2) / VIEW
  ctx.translate(pad, pad)
  ctx.scale(s, s)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.miterLimit = 2

  const inner = poiCategoryIconSvgInner(category)
  const paths = [...inner.matchAll(/<path\s+d="([^"]+)"[^/]*\/>/g)].map((m) => m[1])
  const circles = [
    ...inner.matchAll(/<circle\s+cx="([^"]+)"\s+cy="([^"]+)"\s+r="([^"]+)"[^/]*\/>/g),
  ].map((m) => ({ cx: Number(m[1]), cy: Number(m[2]), r: Number(m[3]) }))

  const paintAll = (mode: 'fill' | 'stroke', color: string, lineWidth?: number) => {
    if (mode === 'stroke') {
      ctx.strokeStyle = color
      ctx.lineWidth = lineWidth ?? 1.5
    } else {
      ctx.fillStyle = color
    }
    for (const d of paths) {
      const p = new Path2D(d)
      if (mode === 'stroke') ctx.stroke(p)
      else ctx.fill(p, 'evenodd')
    }
    for (const c of circles) {
      ctx.beginPath()
      ctx.arc(c.cx, c.cy, c.r, 0, Math.PI * 2)
      if (mode === 'stroke') ctx.stroke()
      else ctx.fill()
    }
  }

  // Thin white rim for contrast on dark category colors, then solid fill on top
  paintAll('stroke', 'rgba(255,255,255,0.92)', 2.4)
  paintAll('fill', '#111827')

  return canvas
}

const POI_ICON_CATEGORIES: PoiCategory[] = [
  'fuel',
  'supermarket',
  'gastronomy',
  'water',
  'beverages',
  'hotel',
  'campsite',
  'bike',
  'checkpoint',
  'sleep',
  'border',
]

/**
 * Register filled POI icons for symbol layers.
 * Display size = CANVAS_PX / PIXEL_RATIO = LOGICAL_PX CSS px at icon-size 1.
 * Color is baked into the raster (not SDF).
 */
export function ensurePoiCategoryImages(map: MaplibreMap) {
  for (const category of POI_ICON_CATEGORIES) {
    const id = poiCategoryIconId(category)
    if (map.hasImage(id)) map.removeImage(id)
    const canvas = drawCategoryIcon(category)
    const ctx = canvas.getContext('2d')
    if (!ctx) continue
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
    map.addImage(id, data, { pixelRatio: PIXEL_RATIO })
  }
}

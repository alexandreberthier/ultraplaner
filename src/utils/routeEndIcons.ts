import type { Map as MaplibreMap } from 'maplibre-gl'
import { routeEndColor, routeStartColor } from '../config/mapStyle'

/**
 * Canvas px — displayed at half size via pixelRatio 2 (~30 CSS px diameter).
 * Filled A/B discs (not teardrop / down-arrow pins) so Start/Ziel stay clear at a glance.
 */
const ICON_W = 60
const ICON_H = 60

export type RouteEndRole = 'start' | 'end' | 'both'

export function routeEndIconId(role: RouteEndRole | string): string {
  if (role === 'end') return 'route-pin-end'
  if (role === 'both') return 'route-pin-both'
  return 'route-pin-start'
}

function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')
  return { canvas, ctx }
}

function discPath(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const cx = w / 2
  const cy = h / 2
  const r = w * 0.42
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.closePath()
}

function strokeDisc(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  color: string,
  lineWidth: number
) {
  discPath(ctx, w, h)
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.stroke()
}

function fillDisc(ctx: CanvasRenderingContext2D, w: number, h: number, color: string) {
  discPath(ctx, w, h)
  ctx.fillStyle = color
  ctx.fill()
}

function drawLetter(ctx: CanvasRenderingContext2D, w: number, h: number, letter: string) {
  ctx.fillStyle = '#ffffff'
  ctx.font = `bold ${Math.round(w * 0.48)}px system-ui, -apple-system, Segoe UI, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = 'rgba(0,0,0,0.35)'
  ctx.shadowBlur = w * 0.04
  ctx.shadowOffsetY = w * 0.02
  ctx.fillText(letter, w / 2, h / 2 + 1)
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
}

function drawSolidDisc(fill: string, letter: string): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(ICON_W, ICON_H)
  ctx.clearRect(0, 0, ICON_W, ICON_H)
  strokeDisc(ctx, ICON_W, ICON_H, '#0f172a', ICON_W * 0.1)
  fillDisc(ctx, ICON_W, ICON_H, fill)
  strokeDisc(ctx, ICON_W, ICON_H, '#ffffff', ICON_W * 0.05)
  drawLetter(ctx, ICON_W, ICON_H, letter)
  return canvas
}

/** Round-trip: vertical split green|red with ↺. */
function drawBothDisc(startFill: string, endFill: string): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(ICON_W, ICON_H)
  ctx.clearRect(0, 0, ICON_W, ICON_H)
  strokeDisc(ctx, ICON_W, ICON_H, '#0f172a', ICON_W * 0.1)

  ctx.save()
  discPath(ctx, ICON_W, ICON_H)
  ctx.clip()
  const mid = ICON_W / 2
  ctx.fillStyle = startFill
  ctx.fillRect(0, 0, mid, ICON_H)
  ctx.fillStyle = endFill
  ctx.fillRect(mid, 0, mid, ICON_H)
  ctx.restore()

  strokeDisc(ctx, ICON_W, ICON_H, '#ffffff', ICON_W * 0.05)
  drawLetter(ctx, ICON_W, ICON_H, '↺')
  return canvas
}

function addOrReplaceImage(map: MaplibreMap, id: string, canvas: HTMLCanvasElement) {
  if (map.hasImage(id)) map.removeImage(id)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
  map.addImage(id, data, { pixelRatio: 2 })
}

/** Register / refresh start·end·both discs (colors follow colorblind mode). */
export function ensureRouteEndImages(map: MaplibreMap) {
  const start = routeStartColor()
  const end = routeEndColor()
  addOrReplaceImage(map, 'route-pin-start', drawSolidDisc(start, 'A'))
  addOrReplaceImage(map, 'route-pin-end', drawSolidDisc(end, 'B'))
  addOrReplaceImage(map, 'route-pin-both', drawBothDisc(start, end))
}

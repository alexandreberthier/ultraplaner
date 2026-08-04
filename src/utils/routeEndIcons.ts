import type { Map as MaplibreMap } from 'maplibre-gl'
import { routeEndColor, routeStartColor } from '../config/mapStyle'

/** Canvas px — displayed at half size via pixelRatio 2 (~28–32 CSS px). */
const ICON_W = 56
const ICON_H = 72

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

/** Teardrop pin path; tip at bottom center. */
function pinPath(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const cx = w / 2
  const cy = h * 0.36
  const r = w * 0.34
  const tipY = h * 0.94
  // Arc over the top (counter-clockwise), then close down to the tip
  ctx.beginPath()
  ctx.arc(cx, cy, r, Math.PI * 0.78, Math.PI * 0.22, true)
  ctx.lineTo(cx, tipY)
  ctx.closePath()
}

function strokePin(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  color: string,
  lineWidth: number
) {
  pinPath(ctx, w, h)
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.lineJoin = 'round'
  ctx.stroke()
}

function fillPin(ctx: CanvasRenderingContext2D, w: number, h: number, color: string) {
  pinPath(ctx, w, h)
  ctx.fillStyle = color
  ctx.fill()
}

function drawLetter(ctx: CanvasRenderingContext2D, w: number, h: number, letter: string) {
  const cy = h * 0.36
  ctx.fillStyle = '#ffffff'
  ctx.font = `bold ${Math.round(w * 0.42)}px system-ui, -apple-system, Segoe UI, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // Soft dark shadow so white letter stays readable on bright fills
  ctx.shadowColor = 'rgba(0,0,0,0.35)'
  ctx.shadowBlur = w * 0.04
  ctx.shadowOffsetY = w * 0.02
  ctx.fillText(letter, w / 2, cy + 1)
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
}

function drawSolidPin(fill: string, letter: string): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(ICON_W, ICON_H)
  ctx.clearRect(0, 0, ICON_W, ICON_H)
  // Outer dark ring first (survives fill), then fill, then white edge
  strokePin(ctx, ICON_W, ICON_H, '#0f172a', ICON_W * 0.12)
  fillPin(ctx, ICON_W, ICON_H, fill)
  strokePin(ctx, ICON_W, ICON_H, '#ffffff', ICON_W * 0.055)
  drawLetter(ctx, ICON_W, ICON_H, letter)
  return canvas
}

/** Round-trip: vertical split green|red with ↺. */
function drawBothPin(startFill: string, endFill: string): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(ICON_W, ICON_H)
  ctx.clearRect(0, 0, ICON_W, ICON_H)
  strokePin(ctx, ICON_W, ICON_H, '#0f172a', ICON_W * 0.12)

  ctx.save()
  pinPath(ctx, ICON_W, ICON_H)
  ctx.clip()
  const mid = ICON_W / 2
  ctx.fillStyle = startFill
  ctx.fillRect(0, 0, mid, ICON_H)
  ctx.fillStyle = endFill
  ctx.fillRect(mid, 0, mid, ICON_H)
  ctx.restore()

  strokePin(ctx, ICON_W, ICON_H, '#ffffff', ICON_W * 0.055)
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

/** Register / refresh start·end·both pins (colors follow colorblind mode). */
export function ensureRouteEndImages(map: MaplibreMap) {
  const start = routeStartColor()
  const end = routeEndColor()
  addOrReplaceImage(map, 'route-pin-start', drawSolidPin(start, 'A'))
  addOrReplaceImage(map, 'route-pin-end', drawSolidPin(end, 'B'))
  addOrReplaceImage(map, 'route-pin-both', drawBothPin(start, end))
}

import type { ControlPointKind } from '../../shared/types'
import type { Map as MaplibreMap } from 'maplibre-gl'

const ICON_SIZE = 64

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

function makeCanvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')
  return { canvas, ctx }
}

function drawBase(ctx: CanvasRenderingContext2D, size: number, fill: string) {
  ctx.clearRect(0, 0, size, size)
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = size * 0.06
  ctx.stroke()
}

/** Flag mark for race checkpoints. */
function drawCpIcon(size = ICON_SIZE): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(size)
  drawBase(ctx, size, '#dc2626')
  ctx.strokeStyle = '#fff'
  ctx.fillStyle = '#fff'
  ctx.lineWidth = size * 0.055
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const poleX = size * 0.36
  ctx.beginPath()
  ctx.moveTo(poleX, size * 0.28)
  ctx.lineTo(poleX, size * 0.72)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(poleX, size * 0.28)
  ctx.lineTo(size * 0.68, size * 0.36)
  ctx.lineTo(poleX, size * 0.46)
  ctx.closePath()
  ctx.fill()
  return canvas
}

/** Simple bed mark for sleep stops. */
function drawSleepIcon(size = ICON_SIZE): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(size)
  drawBase(ctx, size, '#7c3aed')
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = size * 0.05
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  // mattress
  drawRoundedRect(ctx, size * 0.22, size * 0.48, size * 0.56, size * 0.18, size * 0.04)
  ctx.fill()
  // headboard
  drawRoundedRect(ctx, size * 0.22, size * 0.34, size * 0.14, size * 0.18, size * 0.03)
  ctx.fill()
  // pillow
  drawRoundedRect(ctx, size * 0.4, size * 0.38, size * 0.2, size * 0.1, size * 0.03)
  ctx.fill()
  // legs
  ctx.beginPath()
  ctx.moveTo(size * 0.28, size * 0.66)
  ctx.lineTo(size * 0.28, size * 0.74)
  ctx.moveTo(size * 0.72, size * 0.66)
  ctx.lineTo(size * 0.72, size * 0.74)
  ctx.stroke()
  return canvas
}

/** Legacy border (still render if saved). */
function drawBorderIcon(size = ICON_SIZE): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(size)
  drawBase(ctx, size, '#0f766e')
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = size * 0.055
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(size * 0.32, size * 0.28)
  ctx.lineTo(size * 0.32, size * 0.72)
  ctx.moveTo(size * 0.68, size * 0.28)
  ctx.lineTo(size * 0.68, size * 0.72)
  ctx.moveTo(size * 0.32, size * 0.5)
  ctx.lineTo(size * 0.68, size * 0.5)
  ctx.stroke()
  return canvas
}

export function controlPointIconId(kind: ControlPointKind | string): string {
  if (kind === 'sleep') return 'cp-icon-sleep'
  if (kind === 'border') return 'cp-icon-border'
  return 'cp-icon-cp'
}

export function ensureControlPointImages(map: MaplibreMap) {
  const entries: [string, HTMLCanvasElement][] = [
    ['cp-icon-cp', drawCpIcon()],
    ['cp-icon-sleep', drawSleepIcon()],
    ['cp-icon-border', drawBorderIcon()],
  ]
  for (const [id, canvas] of entries) {
    if (map.hasImage(id)) map.removeImage(id)
    const ctx = canvas.getContext('2d')
    if (!ctx) continue
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
    map.addImage(id, data, { pixelRatio: 2 })
  }
}

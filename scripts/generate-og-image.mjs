import sharp from 'sharp'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const logoSrc = join(root, 'scripts/assets/logo-source.png')
const outPath = join(root, 'public/og-image.jpg')

const W = 1200
const H = 630
const cream = '#f3efe6'
const ink = '#111111'
const orange = '#ea580c'
const green = '#2d6a4f'

const logoMaxH = 340
const logo = await sharp(logoSrc)
  .trim({ threshold: 12 })
  .resize({ height: logoMaxH, fit: 'inside' })
  .png()
  .toBuffer()
const logoMeta = await sharp(logo).metadata()
const logoW = logoMeta.width ?? logoMaxH
const logoH = logoMeta.height ?? logoMaxH

const pad = 28
const card = {
  x: 64,
  y: Math.round((H - (logoH + pad * 2)) / 2),
  w: logoW + pad * 2,
  h: logoH + pad * 2,
  r: 20,
  shadow: 10,
}
const logoLeft = card.x + pad
const logoTop = card.y + pad

const overlay = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="${cream}"/>
  <rect x="${card.x + card.shadow}" y="${card.y + card.shadow}" width="${card.w}" height="${card.h}" rx="${card.r}" fill="${ink}"/>
  <rect x="${card.x}" y="${card.y}" width="${card.w}" height="${card.h}" rx="${card.r}" fill="${cream}" stroke="${ink}" stroke-width="6"/>
  <text x="560" y="268" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="72" font-weight="800" fill="${ink}">UltraPlaner</text>
  <text x="560" y="322" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="28" font-weight="650" fill="${ink}">Ultracycling-Routenplanung</text>
  <rect x="560" y="354" width="268" height="10" fill="${orange}"/>
  <text x="560" y="412" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="${green}">GPX · Versorgung · ETA · Spickzettel</text>
  <rect x="0" y="0" width="${W}" height="14" fill="${orange}"/>
  <rect x="0" y="${H - 14}" width="${W}" height="14" fill="${ink}"/>
  <rect x="3" y="3" width="${W - 6}" height="${H - 6}" fill="none" stroke="${ink}" stroke-width="6"/>
</svg>`)

await sharp(overlay)
  .composite([{ input: logo, top: logoTop, left: logoLeft }])
  .jpeg({ quality: 90, mozjpeg: true })
  .toFile(outPath)

const meta = await sharp(outPath).metadata()
console.log(
  'Wrote',
  outPath,
  meta.width + 'x' + meta.height,
  'logo',
  logoW + 'x' + logoH,
  'card',
  `${card.w}x${card.h}@${card.x},${card.y}`
)

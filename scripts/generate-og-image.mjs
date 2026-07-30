import sharp from 'sharp'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const logoSrc = join(root, 'scripts/assets/logo-source.png')
const outPath = join(root, 'public/og-image.jpg')

const W = 1200
const H = 630

const logoSize = 280
const logo = await sharp(logoSrc)
  .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer()

const overlay = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f7faf8"/>
      <stop offset="55%" stop-color="#eef5f0"/>
      <stop offset="100%" stop-color="#dcebe2"/>
    </linearGradient>
    <linearGradient id="band" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#2d6a4f"/>
      <stop offset="100%" stop-color="#40916c"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <path d="M0 520 C180 470 320 560 520 530 C760 490 920 560 1200 500 L1200 630 L0 630 Z" fill="#2d6a4f" opacity="0.12"/>
  <path d="M0 560 C220 520 400 590 640 555 C900 515 1040 585 1200 545 L1200 630 L0 630 Z" fill="#1b4332" opacity="0.16"/>
  <rect x="0" y="0" width="${W}" height="8" fill="url(#band)"/>
  <text x="600" y="430" text-anchor="middle" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="64" font-weight="700" fill="#1b4332">UltraPlaner</text>
  <text x="600" y="480" text-anchor="middle" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="28" font-weight="500" fill="#4a6356">Ultracycling-Routenplanung</text>
</svg>`)

await sharp(overlay)
  .composite([
    {
      input: logo,
      top: 72,
      left: Math.round((W - logoSize) / 2),
    },
  ])
  .jpeg({ quality: 88, mozjpeg: true })
  .toFile(outPath)

const meta = await sharp(outPath).metadata()
console.log('Wrote', outPath, meta.width + 'x' + meta.height)

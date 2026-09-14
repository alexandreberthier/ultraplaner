import sharp from 'sharp'
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const src = join(root, 'scripts/assets/logo-source.png')
const res = join(root, 'android/app/src/main/res')
const playDir = join(root, 'scripts/assets')
const white = { r: 255, g: 255, b: 255, alpha: 1 }
const green = '#2d6a4f'
const ink = '#1a1a1a'

const densities = [
  { name: 'mdpi', launcher: 48, foreground: 108 },
  { name: 'hdpi', launcher: 72, foreground: 162 },
  { name: 'xhdpi', launcher: 96, foreground: 216 },
  { name: 'xxhdpi', launcher: 144, foreground: 324 },
  { name: 'xxxhdpi', launcher: 192, foreground: 432 },
]

async function logoOnCanvas(size, { background, padRatio }) {
  const pad = Math.round(size * padRatio)
  const inner = Math.max(1, size - pad * 2)
  const resized = await sharp(src)
    .trim({ threshold: 12 })
    .resize(inner, inner, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer()
  return sharp({
    create: { width: size, height: size, channels: 4, background },
  })
    .composite([{ input: resized, gravity: 'centre' }])
    .png()
}

for (const d of densities) {
  const dir = join(res, `mipmap-${d.name}`)
  mkdirSync(dir, { recursive: true })
  await (await logoOnCanvas(d.launcher, { background: white, padRatio: 0.12 })).toFile(
    join(dir, 'ic_launcher.png')
  )
  await (await logoOnCanvas(d.launcher, { background: white, padRatio: 0.12 })).toFile(
    join(dir, 'ic_launcher_round.png')
  )
  await (
    await logoOnCanvas(d.foreground, {
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      padRatio: 0.22,
    })
  ).toFile(join(dir, 'ic_launcher_foreground.png'))
}

const drawable = join(res, 'drawable')
mkdirSync(drawable, { recursive: true })
await (await logoOnCanvas(384, { background: { r: 0, g: 0, b: 0, alpha: 0 }, padRatio: 0.08 })).toFile(
  join(drawable, 'splash_logo.png')
)

mkdirSync(playDir, { recursive: true })
await (await logoOnCanvas(512, { background: white, padRatio: 0.1 })).toFile(
  join(playDir, 'play-store-icon-512.png')
)

const featureW = 1024
const featureH = 500
const logo = await sharp(src)
  .trim({ threshold: 12 })
  .resize({ height: 280, fit: 'inside' })
  .png()
  .toBuffer()
const logoMeta = await sharp(logo).metadata()
const logoW = logoMeta.width ?? 280
const logoH = logoMeta.height ?? 280
const logoLeft = 72
const logoTop = Math.round((featureH - logoH) / 2)

const featureSvg = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${featureW}" height="${featureH}" viewBox="0 0 ${featureW} ${featureH}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${featureW}" height="${featureH}" fill="#ffffff"/>
  <rect x="0" y="0" width="12" height="${featureH}" fill="${green}"/>
  <text x="420" y="210" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="64" font-weight="800" fill="${ink}">UltraPlaner</text>
  <text x="420" y="262" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="26" font-weight="600" fill="${ink}">Ultracycling-Routenplanung</text>
  <text x="420" y="330" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="${green}">GPX · Versorgung · ETA · Spickzettel</text>
</svg>`)

await sharp(featureSvg)
  .composite([{ input: logo, top: logoTop, left: logoLeft }])
  .png()
  .toFile(join(playDir, 'play-feature-graphic-1024x500.png'))

console.log('Android launcher, splash, Play 512 icon, and 1024×500 feature graphic written')

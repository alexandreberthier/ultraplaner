import sharp from 'sharp'
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const src = join(root, 'scripts/assets/logo-source.png')
const res = join(root, 'android/app/src/main/res')
const cream = { r: 243, g: 239, b: 230, alpha: 1 }

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
  await (await logoOnCanvas(d.launcher, { background: cream, padRatio: 0.12 })).toFile(
    join(dir, 'ic_launcher.png')
  )
  await (await logoOnCanvas(d.launcher, { background: cream, padRatio: 0.12 })).toFile(
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

const playDir = join(root, 'scripts/assets')
await (await logoOnCanvas(512, { background: cream, padRatio: 0.1 })).toFile(
  join(playDir, 'play-store-icon-512.png')
)

console.log('Android launcher, splash logo, and Play 512 icon written')

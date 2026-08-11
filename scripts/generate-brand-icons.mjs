import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const src = join(root, 'scripts/assets/logo-source.png')
const outDir = join(root, 'public')

const meta = await sharp(src).metadata()
console.log('src', meta.width, meta.height, meta.format, 'alpha=', meta.hasAlpha)

async function containOnCanvas(size, { background, padRatio = 0.14 } = {}) {
  const pad = Math.round(size * padRatio)
  const inner = Math.max(1, size - pad * 2)
  const resized = await sharp(src)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background,
    },
  })
    .composite([{ input: resized, gravity: 'centre' }])
    .png()
}

const white = { r: 255, g: 255, b: 255, alpha: 1 }

await sharp(src)
  .resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(join(outDir, 'logo-ultraplaner.png'))

await sharp(src)
  .resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .webp({ quality: 92 })
  .toFile(join(outDir, 'logo-ultraplaner.webp'))

for (const size of [64, 96, 200, 400]) {
  await sharp(src)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(join(outDir, `logo-ultraplaner-${size}.png`))

  await sharp(src)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 88 })
    .toFile(join(outDir, `logo-ultraplaner-${size}.webp`))
}

for (const [file, size, pad] of [
  ['favicon-32.png', 32, 0.12],
  ['favicon-48.png', 48, 0.12],
  ['favicon-192.png', 192, 0.1],
  ['favicon-512.png', 512, 0.1],
  ['apple-touch-icon.png', 180, 0.1],
]) {
  await (await containOnCanvas(size, { background: white, padRatio: pad })).toFile(join(outDir, file))
}

const png16 = await (await containOnCanvas(16, { background: white, padRatio: 0.1 })).toBuffer()
const png32 = readFileSync(join(outDir, 'favicon-32.png'))
const png48 = readFileSync(join(outDir, 'favicon-48.png'))

function icoFromPngs(buffers, sizes) {
  const count = buffers.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(count, 4)
  const dir = Buffer.alloc(16 * count)
  let offset = 6 + 16 * count
  const parts = [header, dir]
  for (let i = 0; i < count; i++) {
    const s = sizes[i]
    const b = buffers[i]
    const o = 16 * i
    dir.writeUInt8(s >= 256 ? 0 : s, o)
    dir.writeUInt8(s >= 256 ? 0 : s, o + 1)
    dir.writeUInt8(0, o + 2)
    dir.writeUInt8(0, o + 3)
    dir.writeUInt16LE(1, o + 4)
    dir.writeUInt16LE(32, o + 6)
    dir.writeUInt32LE(b.length, o + 8)
    dir.writeUInt32LE(offset, o + 12)
    parts.push(b)
    offset += b.length
  }
  return Buffer.concat(parts)
}

writeFileSync(join(outDir, 'favicon.ico'), icoFromPngs([png16, png32, png48], [16, 32, 48]))

// SVG favicon: embed a compact PNG so Google/browsers get the real mark
const svgPng = await (await containOnCanvas(128, { background: white, padRatio: 0.08 }))
  .png({ compressionLevel: 9 })
  .toBuffer()
const b64 = svgPng.toString('base64')
writeFileSync(
  join(outDir, 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">\n  <image href="data:image/png;base64,${b64}" width="128" height="128"/>\n</svg>\n`
)

console.log('Brand icons written to public/')

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/**
 * Convert a hex color like "#22c55e" into an {r,g,b} object.
 */
function hexToRgb(hex) {
  const normalized = hex.startsWith('#') ? hex.slice(1) : hex
  if (normalized.length !== 6) throw new Error(`Expected 6-digit hex color, got: ${hex}`)
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  }
}

/**
 * Precompute the CRC32 lookup table used by PNG chunks.
 */
function buildCrc32Table() {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
}

const CRC32_TABLE = buildCrc32Table()

/**
 * Compute CRC32 for a PNG chunk (run over `type` + `data`).
 */
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC32_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

/**
 * Build a PNG chunk buffer given a 4-char type and a data buffer.
 */
function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const lengthBuf = Buffer.alloc(4)
  lengthBuf.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([lengthBuf, typeBuf, data, crcBuf])
}

/**
 * Create a complete PNG file buffer for an RGBA image with filter=0 scanlines.
 */
function createRgbaPng({ width, height, pixelAt }) {
  const rowSize = 1 + width * 4
  const raw = Buffer.alloc(rowSize * height)
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * rowSize
    raw[rowOffset] = 0 // filter type 0 (None)
    for (let x = 0; x < width; x += 1) {
      const { r, g, b, a } = pixelAt(x, y)
      const idx = rowOffset + 1 + x * 4
      raw[idx + 0] = r
      raw[idx + 1] = g
      raw[idx + 2] = b
      raw[idx + 3] = a
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace

  const idat = zlib.deflateSync(raw)

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

/**
 * Clamp a number to an inclusive [min, max] range.
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

/**
 * Linearly interpolate between two numbers.
 */
function lerp(a, b, t) {
  return a + (b - a) * t
}

/**
 * Blend two RGB colors using linear interpolation.
 */
function mixRgb(a, b, t) {
  return {
    r: Math.round(lerp(a.r, b.r, t)),
    g: Math.round(lerp(a.g, b.g, t)),
    b: Math.round(lerp(a.b, b.b, t)),
  }
}

/**
 * Return the RGBA pixel for the cal.io icon at (x,y) for a given square `size`.
 */
function iconPixel(x, y, size) {
  const bg = hexToRgb('#111827')
  const green = hexToRgb('#22c55e')
  const blue = hexToRgb('#38bdf8')

  const cx = (size - 1) / 2
  const cy = (size - 1) / 2
  const dx = x - cx
  const dy = y - cy
  const dist = Math.hypot(dx, dy)

  const ringRadius = size * 0.295
  const ringThickness = size * 0.11
  const rInner = ringRadius - ringThickness / 2
  const rOuter = ringRadius + ringThickness / 2

  // Accent dot in the upper-right (scaled from the SVG's 512px design).
  const dotX = size * (365 / 512)
  const dotY = size * (165 / 512)
  const dotR = size * (18 / 512)
  const dotDist = Math.hypot(x - dotX, y - dotY)

  if (dotDist <= dotR) {
    return { ...green, a: 255 }
  }

  if (dist >= rInner && dist <= rOuter) {
    // Color around the ring based on angle to mimic a simple gradient.
    const angle = Math.atan2(dy, dx) // [-pi, pi]
    const t = (angle + Math.PI) / (2 * Math.PI) // [0, 1]
    const ring = mixRgb(green, blue, t)
    return { ...ring, a: 255 }
  }

  // Subtle vignette to keep edges from looking flat on home screens.
  const vignette = clamp((dist / (size * 0.72) - 0.5) * 0.22, 0, 0.16)
  return {
    r: Math.round(bg.r * (1 - vignette)),
    g: Math.round(bg.g * (1 - vignette)),
    b: Math.round(bg.b * (1 - vignette)),
    a: 255,
  }
}

/**
 * Write the PWA icon assets used by the web manifest and iOS home screen.
 */
function writeIcons(outDir) {
  const write = (name, size) => {
    const png = createRgbaPng({
      width: size,
      height: size,
      pixelAt: (x, y) => iconPixel(x, y, size),
    })
    fs.writeFileSync(path.join(outDir, name), png)
  }

  write('pwa-192x192.png', 192)
  write('pwa-512x512.png', 512)
  write('apple-touch-icon.png', 180)
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
writeIcons(path.join(repoRoot, 'public'))


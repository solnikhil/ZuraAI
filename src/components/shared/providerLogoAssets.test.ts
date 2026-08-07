// @vitest-environment node

import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guards issue #140: `public/provider-logos/alibaba.png` was 3840x3840 while
 * being displayed at 14-28 px, costing roughly 56 MiB of decoded RGBA on its
 * own. Other 1024 px provider PNGs added further decode/texture pressure in a
 * long-lived desktop renderer.
 *
 * The `check:assets` script is the developer-facing report; this test is the
 * automated gate so an oversized asset cannot be committed unnoticed.
 */

const logosDir = path.resolve(__dirname, '../../../public/provider-logos')

/** Largest rendered size, doubled for HiDPI headroom. */
const MAX_DIMENSION = 128
const MAX_FILE_SIZE_BYTES = 100 * 1024

/** Reads intrinsic dimensions straight out of the PNG IHDR chunk. */
function pngDimensions(filePath: string): { width: number; height: number } {
  const buffer = readFileSync(filePath)

  const signature = buffer.subarray(0, 8).toString('hex')
  expect(signature, `${path.basename(filePath)} is not a PNG`).toBe('89504e470d0a1a0a')

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  }
}

/** Decoded RGBA cost the compositor pays regardless of the file size. */
function decodedMebibytes(width: number, height: number): number {
  return (width * height * 4) / 1024 / 1024
}

const imageFiles = readdirSync(logosDir).filter((file) => /\.(png|jpe?g|webp|avif)$/i.test(file))

describe('provider logo asset budget', () => {
  it('finds provider logo assets to check', () => {
    expect(imageFiles.length).toBeGreaterThan(0)
  })

  for (const file of imageFiles) {
    const filePath = path.join(logosDir, file)

    it(`${file} stays within the raster dimension budget`, () => {
      // Raster formats other than PNG are not currently shipped; if that
      // changes, extend the dimension reader rather than skipping the check.
      expect(file.endsWith('.png'), `${file}: add a dimension reader for this format`).toBe(true)

      const { width, height } = pngDimensions(filePath)
      expect(
        Math.max(width, height),
        `${file} is ${width}x${height}, which decodes to ~${decodedMebibytes(width, height).toFixed(1)} MiB of RGBA`
      ).toBeLessThanOrEqual(MAX_DIMENSION)
    })

    it(`${file} stays within the decoded-memory budget`, () => {
      const { width, height } = pngDimensions(filePath)
      // 128x128 RGBA is 64 KiB; anything near a mebibyte means the asset is
      // wildly oversized for a 14-28 px control.
      expect(decodedMebibytes(width, height)).toBeLessThan(1)
    })

    it(`${file} stays within the file size budget`, () => {
      expect(statSync(filePath).size).toBeLessThanOrEqual(MAX_FILE_SIZE_BYTES)
    })
  }

  it('preserves the alpha channel on every logo', () => {
    for (const file of imageFiles.filter((name) => name.endsWith('.png'))) {
      const buffer = readFileSync(path.join(logosDir, file))
      // IHDR colour type lives at byte 25: 6 = RGBA, 4 = grey+alpha, 3 = palette
      // (which carries alpha via tRNS).
      const colourType = buffer.readUInt8(25)
      const hasTransparencyChunk = buffer.includes(Buffer.from('tRNS'))
      expect(
        colourType === 6 || colourType === 4 || hasTransparencyChunk,
        `${file} lost its alpha channel (colour type ${colourType})`
      ).toBe(true)
    }
  })

  it('is enforced by a committed check:assets script', () => {
    const pkg = JSON.parse(
      readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8')
    ) as { scripts: Record<string, string> }
    expect(pkg.scripts['check:assets']).toBeTruthy()
  })
})

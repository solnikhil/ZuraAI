/**
 * Resize oversized provider logos to 128x128px max.
 * Preserves alpha channel and uses high-quality resampling.
 */

import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const LOGOS_DIR = path.resolve(import.meta.dirname, '../public/provider-logos')
const MAX_SIZE = 128

async function main() {
  const files = await readdir(LOGOS_DIR)
  const pngFiles = files.filter((f) => f.endsWith('.png'))

  console.log(`Scanning ${pngFiles.length} PNG files in ${LOGOS_DIR}...\n`)

  let resizedCount = 0

  for (const file of pngFiles) {
    const filePath = path.join(LOGOS_DIR, file)
    const image = sharp(filePath)
    const metadata = await image.metadata()

    const width = metadata.width || 0
    const height = metadata.height || 0

    if (width > MAX_SIZE || height > MAX_SIZE) {
      console.log(`Resizing ${file}: ${width}x${height} -> ${MAX_SIZE}x${MAX_SIZE}`)

      const resized = await sharp(filePath)
        .resize(MAX_SIZE, MAX_SIZE, {
          fit: 'inside',
          withoutEnlargement: true,
          kernel: sharp.kernel.lanczos3,
        })
        .png({ quality: 100, compressionLevel: 9 })
        .toBuffer()

      await sharp(resized).toFile(filePath)
      resizedCount++
    } else {
      console.log(`OK ${file}: ${width}x${height} (within budget)`)
    }
  }

  console.log(`\nDone. Resized ${resizedCount} file(s) out of ${pngFiles.length} PNG(s).`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

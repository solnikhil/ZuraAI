/**
 * Asset budget checker for provider logos.
 * Fails if any PNG exceeds 128x128 pixels or 100KB file size.
 * SVG files are reported but excluded from dimension checks.
 */

import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const LOGOS_DIR = path.resolve(import.meta.dirname, '../public/provider-logos')
const MAX_DIMENSION = 128
const MAX_FILE_SIZE = 100 * 1024 // 100KB

async function main() {
  const files = await readdir(LOGOS_DIR)
  const imageFiles = files.filter(
    (f) => f.endsWith('.png') || f.endsWith('.svg') || f.endsWith('.jpg') || f.endsWith('.webp')
  )

  console.log(`Checking ${imageFiles.length} image files in ${LOGOS_DIR}...\n`)
  console.log('File'.padEnd(25) + 'Dimensions'.padEnd(15) + 'Size')
  console.log('-'.repeat(55))

  let failed = false
  const failures = []

  for (const file of imageFiles) {
    const filePath = path.join(LOGOS_DIR, file)
    const fileStat = await stat(filePath)
    const fileSize = fileStat.size
    const fileSizeStr = fileSize >= 1024 ? `${(fileSize / 1024).toFixed(1)}KB` : `${fileSize}B`

    if (file.endsWith('.svg')) {
      console.log(`${file.padEnd(25)}${'(svg)'.padEnd(15)}${fileSizeStr}`)
      continue
    }

    // For raster images, check dimensions
    const metadata = await sharp(filePath).metadata()
    const width = metadata.width || 0
    const height = metadata.height || 0
    const dimStr = `${width}x${height}`

    let status = ''
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      status = ' FAIL (dimensions)'
      failures.push(`${file}: ${dimStr} exceeds ${MAX_DIMENSION}x${MAX_DIMENSION}`)
      failed = true
    }
    if (fileSize > MAX_FILE_SIZE) {
      status += ' FAIL (size)'
      failures.push(`${file}: ${fileSizeStr} exceeds 100KB`)
      failed = true
    }

    console.log(`${file.padEnd(25)}${dimStr.padEnd(15)}${fileSizeStr}${status}`)
  }

  console.log('-'.repeat(55))

  if (failed) {
    console.log('\nAsset budget check FAILED:')
    for (const f of failures) {
      console.log(`  - ${f}`)
    }
    process.exit(1)
  } else {
    console.log('\nAll assets within budget.')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

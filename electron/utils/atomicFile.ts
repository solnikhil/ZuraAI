import * as fs from 'fs/promises'
import * as path from 'path'
import { randomUUID } from 'crypto'

function buildTempPath(filePath: string): string {
  const dir = path.dirname(filePath)
  const base = path.basename(filePath)
  return path.join(dir, `.${base}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`)
}

function buildBackupPath(filePath: string): string {
  const dir = path.dirname(filePath)
  const base = path.basename(filePath)
  return path.join(dir, `.${base}.${process.pid}.${Date.now()}.${randomUUID()}.bak`)
}

async function writeTempFile(tempPath: string, content: string): Promise<void> {
  const handle = await fs.open(tempPath, 'w')
  try {
    await handle.writeFile(content, 'utf-8')
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function replaceWithBackup(tempPath: string, filePath: string): Promise<void> {
  const backupPath = buildBackupPath(filePath)
  let existingMoved = false

  try {
    await fs.rename(filePath, backupPath)
    existingMoved = true
    await fs.rename(tempPath, filePath)
    await fs.rm(backupPath, { force: true })
  } catch (error) {
    if (existingMoved) {
      try {
        await fs.rename(backupPath, filePath)
      } catch {
        // Keep the original error; restoration is best-effort.
      }
    }
    throw error
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => undefined)
    if (!existingMoved) {
      await fs.rm(backupPath, { force: true }).catch(() => undefined)
    }
  }
}

export async function writeFileAtomic(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })

  const tempPath = buildTempPath(filePath)
  await writeTempFile(tempPath, content)

  try {
    await fs.rename(tempPath, filePath)
  } catch (error) {
    const errorCode =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as NodeJS.ErrnoException).code)
        : ''

    if (errorCode === 'EEXIST' || errorCode === 'EPERM') {
      await replaceWithBackup(tempPath, filePath)
      return
    }

    await fs.rm(tempPath, { force: true }).catch(() => undefined)
    throw error
  }
}

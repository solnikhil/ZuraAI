import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as path from 'path'
import { randomUUID } from 'crypto'

function buildTempPath(filePath: string): string {
  const dir = path.dirname(filePath)
  const base = path.basename(filePath)
  return path.join(dir, `.${base}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`)
}

export function buildJournalPath(filePath: string): string {
  const dir = path.dirname(filePath)
  const base = path.basename(filePath)
  return path.join(dir, `.${base}.journal`)
}

async function writeTempFile(tempPath: string, content: string | Buffer): Promise<void> {
  const handle = await fs.open(tempPath, 'w')
  try {
    if (typeof content === 'string') {
      await handle.writeFile(content, 'utf-8')
    } else {
      await handle.writeFile(content)
    }
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function fsyncDir(dirPath: string): Promise<void> {
  if (process.platform === 'win32') return
  let handle: fs.FileHandle | undefined
  try {
    handle = await fs.open(dirPath, 'r')
    await handle.sync()
  } catch {
    // Best-effort: some platforms do not allow opening directories for sync.
  } finally {
    await handle?.close()
  }
}

async function replaceWithJournal(tempPath: string, filePath: string): Promise<void> {
  const journalPath = buildJournalPath(filePath)
  const dir = path.dirname(filePath)

  // Move existing target to the deterministic journal location.
  await fs.rename(filePath, journalPath)
  await fsyncDir(dir)

  try {
    // Move temp file into target location.
    await fs.rename(tempPath, filePath)
    await fsyncDir(dir)

    // Write succeeded; remove journal.
    await fs.rm(journalPath, { force: true })
  } catch (error) {
    // Attempt to restore original from journal.
    try {
      await fs.rename(journalPath, filePath)
    } catch {
      // Restoration is best-effort; keep the original error.
    }
    throw error
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => undefined)
  }
}

/**
 * Synchronous atomic write, for the few stores that must be readable/writable
 * from synchronous startup paths (for example analytics consent).
 *
 * Same contract as {@link writeFileAtomic}: write a temp file, fsync it, then
 * replace the target so a reader never observes a partially written document.
 */
export function writeFileAtomicSync(filePath: string, content: string | Buffer): void {
  const dir = path.dirname(filePath)
  fsSync.mkdirSync(dir, { recursive: true })

  const tempPath = buildTempPath(filePath)
  const handle = fsSync.openSync(tempPath, 'w')
  try {
    fsSync.writeFileSync(handle, content)
    fsSync.fsyncSync(handle)
  } finally {
    fsSync.closeSync(handle)
  }

  try {
    fsSync.renameSync(tempPath, filePath)
  } catch (error) {
    try {
      fsSync.rmSync(tempPath, { force: true })
    } catch {
      // Best-effort cleanup; surface the original failure.
    }
    throw error
  }
}

export async function writeFileAtomic(filePath: string, content: string | Buffer): Promise<void> {
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })

  const tempPath = buildTempPath(filePath)
  await writeTempFile(tempPath, content)

  try {
    await fs.rename(tempPath, filePath)
    await fsyncDir(dir)
  } catch (error) {
    const errorCode =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as NodeJS.ErrnoException).code)
        : ''

    if (errorCode === 'EEXIST' || errorCode === 'EPERM') {
      await replaceWithJournal(tempPath, filePath)
      return
    }

    await fs.rm(tempPath, { force: true }).catch(() => undefined)
    throw error
  }
}

/**
 * Recover from a previously interrupted atomic write.
 *
 * - If the journal file exists but the target does not, the crash happened
 *   after the target was moved to journal but before the temp was renamed.
 *   Recovery: rename journal back to the target.
 * - If both journal and target exist, the write completed but the journal
 *   removal was interrupted. Recovery: remove the stale journal.
 * - If only the target exists (no journal), there is nothing to recover.
 *
 * Returns true if recovery action was taken, false otherwise.
 */
export async function recoverAtomicWrite(filePath: string): Promise<boolean> {
  const journalPath = buildJournalPath(filePath)

  const [journalExists, targetExists] = await Promise.all([
    fs
      .access(journalPath)
      .then(() => true)
      .catch(() => false),
    fs
      .access(filePath)
      .then(() => true)
      .catch(() => false),
  ])

  if (!journalExists) {
    return false
  }

  if (journalExists && !targetExists) {
    // Crash after moving target to journal, before temp was renamed into place.
    await fs.rename(journalPath, filePath)
    await fsyncDir(path.dirname(filePath))
    return true
  }

  // Both exist: write completed but journal cleanup was interrupted.
  await fs.rm(journalPath, { force: true })
  return true
}

/**
 * Scan a directory for any leftover .journal files and recover each one.
 * Returns the list of file paths that were recovered.
 */
export async function recoverAllAtomicWrites(dirPath: string): Promise<string[]> {
  let entries: string[]
  try {
    entries = await fs.readdir(dirPath)
  } catch {
    return []
  }

  const recovered: string[] = []

  for (const entry of entries) {
    if (!entry.endsWith('.journal')) continue
    // Derive original filename: strip leading dot and trailing .journal
    // e.g. ".data.json.journal" -> "data.json"
    const withoutJournal = entry.slice(0, -'.journal'.length)
    const originalBase = withoutJournal.startsWith('.') ? withoutJournal.slice(1) : withoutJournal
    const originalPath = path.join(dirPath, originalBase)

    const didRecover = await recoverAtomicWrite(originalPath)
    if (didRecover) {
      recovered.push(originalPath)
    }
  }

  return recovered
}

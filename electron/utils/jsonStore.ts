import * as fs from 'fs/promises'
import * as fsSync from 'fs'

/**
 * Shared read semantics for main-owned JSON stores, per `docs/PERSISTENCE.md`:
 *
 * | Situation                        | Behaviour                              |
 * | -------------------------------- | -------------------------------------- |
 * | File missing (`ENOENT`)          | empty state                            |
 * | Invalid JSON / wrong root shape  | corruption path (quarantine the file)  |
 * | Permission / device / other I/O  | propagate - never look like "empty"    |
 *
 * The last row is the important one: a transient filesystem problem must not be
 * mistaken for "the user deleted everything" and then persisted as such.
 */

export type JsonStoreFileRead = { status: 'missing' } | { status: 'present'; raw: string }

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  )
}

/**
 * Reads a store file, distinguishing "not there yet" from a real I/O failure.
 *
 * @throws the original error for any failure other than `ENOENT`.
 */
export async function readJsonStoreFile(filePath: string): Promise<JsonStoreFileRead> {
  try {
    return { status: 'present', raw: await fs.readFile(filePath, 'utf-8') }
  } catch (error) {
    if (isMissingFileError(error)) return { status: 'missing' }
    throw error
  }
}

/** Sync counterpart of {@link readJsonStoreFile}. */
export function readJsonStoreFileSync(filePath: string): JsonStoreFileRead {
  try {
    return { status: 'present', raw: fsSync.readFileSync(filePath, 'utf-8') }
  } catch (error) {
    if (isMissingFileError(error)) return { status: 'missing' }
    throw error
  }
}

/**
 * Moves a proven-unreadable store aside so the corrupt bytes are preserved for
 * diagnosis instead of being overwritten by the next mutation.
 *
 * @returns the quarantine path, or `null` if the file could not be moved.
 */
export async function quarantineCorruptStore(
  filePath: string,
  onWarn?: (message: string) => void
): Promise<string | null> {
  const quarantinePath = `${filePath}.corrupt-${Date.now()}`
  try {
    await fs.rename(filePath, quarantinePath)
    onWarn?.(`quarantined unreadable store to ${quarantinePath}`)
    return quarantinePath
  } catch (error) {
    if (isMissingFileError(error)) return null
    onWarn?.(
      `failed to quarantine unreadable store ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
    return null
  }
}

/** Sync counterpart of {@link quarantineCorruptStore}. */
export function quarantineCorruptStoreSync(
  filePath: string,
  onWarn?: (message: string) => void
): string | null {
  const quarantinePath = `${filePath}.corrupt-${Date.now()}`
  try {
    fsSync.renameSync(filePath, quarantinePath)
    onWarn?.(`quarantined unreadable store to ${quarantinePath}`)
    return quarantinePath
  } catch (error) {
    if (isMissingFileError(error)) return null
    onWarn?.(
      `failed to quarantine unreadable store ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
    return null
  }
}

/**
 * Parses store JSON and asserts a plain-object root.
 *
 * @throws if the payload is not valid JSON or the root is not a plain object,
 *   which callers must treat as corruption rather than as an empty store.
 */
export function parseJsonStoreRoot(raw: string): Record<string, unknown> {
  const parsed = JSON.parse(raw) as unknown
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Expected a JSON object root, received ${describeRoot(parsed)}`)
  }
  return parsed as Record<string, unknown>
}

function describeRoot(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'an array'
  return typeof value
}

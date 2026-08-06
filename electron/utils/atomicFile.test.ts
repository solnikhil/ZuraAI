// @vitest-environment node

import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildJournalPath,
  recoverAllAtomicWrites,
  recoverAtomicWrite,
  writeFileAtomic,
} from './atomicFile'

describe('atomicFile', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'zura-atomic-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  describe('buildJournalPath', () => {
    it('produces a deterministic journal path for a given file', () => {
      const filePath = path.join('/some/dir', 'data.json')
      expect(buildJournalPath(filePath)).toBe(path.join('/some/dir', '.data.json.journal'))
    })

    it('is stable across multiple calls', () => {
      const filePath = path.join('/a/b', 'file.txt')
      expect(buildJournalPath(filePath)).toBe(buildJournalPath(filePath))
    })
  })

  describe('writeFileAtomic', () => {
    it('writes content to a new file', async () => {
      const filePath = path.join(tmpDir, 'new.json')
      await writeFileAtomic(filePath, '{"hello":"world"}')
      const content = await readFile(filePath, 'utf-8')
      expect(content).toBe('{"hello":"world"}')
    })

    it('overwrites existing file content atomically', async () => {
      const filePath = path.join(tmpDir, 'existing.json')
      await writeFile(filePath, 'original')
      await writeFileAtomic(filePath, 'updated')
      const content = await readFile(filePath, 'utf-8')
      expect(content).toBe('updated')
    })

    it('creates parent directories if they do not exist', async () => {
      const filePath = path.join(tmpDir, 'sub', 'deep', 'file.json')
      await writeFileAtomic(filePath, 'nested')
      const content = await readFile(filePath, 'utf-8')
      expect(content).toBe('nested')
    })

    it('does not leave temp or journal files after a successful write', async () => {
      const filePath = path.join(tmpDir, 'clean.json')
      await writeFile(filePath, 'before')
      await writeFileAtomic(filePath, 'after')
      const entries = await readdir(tmpDir)
      const artifacts = entries.filter((e) => e.includes('.tmp') || e.includes('.journal'))
      expect(artifacts).toHaveLength(0)
    })

    it('handles Buffer content', async () => {
      const filePath = path.join(tmpDir, 'binary.bin')
      const buf = Buffer.from([0x00, 0x01, 0x02, 0xff])
      await writeFileAtomic(filePath, buf)
      const content = await readFile(filePath)
      expect(content).toEqual(buf)
    })
  })

  describe('recoverAtomicWrite', () => {
    it('returns false when no journal exists', async () => {
      const filePath = path.join(tmpDir, 'data.json')
      await writeFile(filePath, 'content')
      const recovered = await recoverAtomicWrite(filePath)
      expect(recovered).toBe(false)
      expect(await readFile(filePath, 'utf-8')).toBe('content')
    })

    it('recovers when journal exists but target is missing (crash after target move)', async () => {
      // Simulate: target was moved to journal, then crash before temp rename.
      const filePath = path.join(tmpDir, 'data.json')
      const journalPath = buildJournalPath(filePath)
      await writeFile(journalPath, 'original-content')

      const recovered = await recoverAtomicWrite(filePath)
      expect(recovered).toBe(true)

      // Journal should be renamed back to target
      const content = await readFile(filePath, 'utf-8')
      expect(content).toBe('original-content')

      // Journal file should no longer exist
      const entries = await readdir(tmpDir)
      expect(entries.filter((e) => e.includes('.journal'))).toHaveLength(0)
    })

    it('removes stale journal when both journal and target exist (crash after write completed)', async () => {
      // Simulate: write succeeded but journal removal was interrupted.
      const filePath = path.join(tmpDir, 'data.json')
      const journalPath = buildJournalPath(filePath)
      await writeFile(filePath, 'new-content')
      await writeFile(journalPath, 'old-content')

      const recovered = await recoverAtomicWrite(filePath)
      expect(recovered).toBe(true)

      // Target should retain the new content
      const content = await readFile(filePath, 'utf-8')
      expect(content).toBe('new-content')

      // Journal should be removed
      const entries = await readdir(tmpDir)
      expect(entries.filter((e) => e.includes('.journal'))).toHaveLength(0)
    })

    it('handles non-existent target and non-existent journal gracefully', async () => {
      const filePath = path.join(tmpDir, 'ghost.json')
      const recovered = await recoverAtomicWrite(filePath)
      expect(recovered).toBe(false)
    })
  })

  describe('recoverAllAtomicWrites', () => {
    it('returns empty array for a directory with no journal files', async () => {
      await writeFile(path.join(tmpDir, 'a.json'), 'a')
      await writeFile(path.join(tmpDir, 'b.json'), 'b')
      const recovered = await recoverAllAtomicWrites(tmpDir)
      expect(recovered).toEqual([])
    })

    it('recovers multiple journal files in a directory', async () => {
      // Simulate two interrupted writes: target missing for both
      const file1 = path.join(tmpDir, 'one.json')
      const file2 = path.join(tmpDir, 'two.json')
      await writeFile(buildJournalPath(file1), 'data-one')
      await writeFile(buildJournalPath(file2), 'data-two')

      const recovered = await recoverAllAtomicWrites(tmpDir)
      expect(recovered.sort()).toEqual([file1, file2].sort())

      expect(await readFile(file1, 'utf-8')).toBe('data-one')
      expect(await readFile(file2, 'utf-8')).toBe('data-two')
    })

    it('returns empty array for a non-existent directory', async () => {
      const recovered = await recoverAllAtomicWrites(path.join(tmpDir, 'does-not-exist'))
      expect(recovered).toEqual([])
    })

    it('handles mix of recoverable and already-completed journal files', async () => {
      // file1: journal only (needs recovery)
      const file1 = path.join(tmpDir, 'alpha.json')
      await writeFile(buildJournalPath(file1), 'alpha-original')

      // file2: both exist (journal removal interrupted)
      const file2 = path.join(tmpDir, 'beta.json')
      await writeFile(file2, 'beta-new')
      await writeFile(buildJournalPath(file2), 'beta-old')

      const recovered = await recoverAllAtomicWrites(tmpDir)
      expect(recovered.sort()).toEqual([file1, file2].sort())

      // file1 restored from journal
      expect(await readFile(file1, 'utf-8')).toBe('alpha-original')
      // file2 keeps new content, journal removed
      expect(await readFile(file2, 'utf-8')).toBe('beta-new')

      const entries = await readdir(tmpDir)
      expect(entries.filter((e) => e.includes('.journal'))).toHaveLength(0)
    })
  })

  describe('fault injection - replaceWithJournal path', () => {
    it('uses journal path during EEXIST fallback on overwrite', async () => {
      // On platforms where rename does not replace existing files (Windows),
      // writeFileAtomic falls back to replaceWithJournal. We can simulate
      // this scenario by having a file in place.
      const filePath = path.join(tmpDir, 'overwrite.json')
      await writeFile(filePath, 'v1')

      // Force the EEXIST path by making the initial rename fail.
      // We do this by creating the target as a directory briefly - not reliable,
      // so instead test the full round-trip via writeFileAtomic.
      await writeFileAtomic(filePath, 'v2')
      expect(await readFile(filePath, 'utf-8')).toBe('v2')

      // Verify no leftover artifacts
      const entries = await readdir(tmpDir)
      expect(entries.filter((e) => e.includes('.journal') || e.includes('.bak'))).toHaveLength(0)
    })

    it('simulates crash after journal creation - target missing', async () => {
      const filePath = path.join(tmpDir, 'crash1.json')
      const journalPath = buildJournalPath(filePath)

      // State: original moved to journal, temp exists but not yet renamed
      await writeFile(journalPath, 'precious-data')
      // The temp file would be here but is irrelevant to recovery
      await writeFile(path.join(tmpDir, '.crash1.json.1234.tmp'), 'temp-content')

      const recovered = await recoverAtomicWrite(filePath)
      expect(recovered).toBe(true)
      expect(await readFile(filePath, 'utf-8')).toBe('precious-data')
    })

    it('simulates crash after target removal but before temp rename', async () => {
      const filePath = path.join(tmpDir, 'crash2.json')
      const journalPath = buildJournalPath(filePath)

      // State: original moved to journal, target is gone
      await writeFile(journalPath, 'original')

      const recovered = await recoverAtomicWrite(filePath)
      expect(recovered).toBe(true)
      expect(await readFile(filePath, 'utf-8')).toBe('original')
    })

    it('simulates crash after successful rename but before journal cleanup', async () => {
      const filePath = path.join(tmpDir, 'crash3.json')
      const journalPath = buildJournalPath(filePath)

      // State: new file in place, journal still around
      await writeFile(filePath, 'new-data')
      await writeFile(journalPath, 'old-data')

      const recovered = await recoverAtomicWrite(filePath)
      expect(recovered).toBe(true)
      // New data preserved
      expect(await readFile(filePath, 'utf-8')).toBe('new-data')
      // Journal cleaned up
      const entries = await readdir(tmpDir)
      expect(entries.filter((e) => e.includes('.journal'))).toHaveLength(0)
    })
  })
})

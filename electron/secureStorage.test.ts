// @vitest-environment node

import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electronMock = vi.hoisted(() => ({
  userDataPath: '',
  encryptionAvailable: true,
  writeThrows: false,
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => electronMock.userDataPath),
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => electronMock.encryptionAvailable),
    encryptString: vi.fn((value: string) => Buffer.from(`encrypted:${value}`, 'utf8')),
    decryptString: vi.fn((value: Buffer) => {
      const decoded = value.toString('utf8')
      if (!decoded.startsWith('encrypted:')) throw new Error('not encrypted')
      return decoded.slice('encrypted:'.length)
    }),
  },
}))

vi.mock('./utils/atomicFile', async (importOriginal) => {
  const orig = (await importOriginal()) as Record<string, unknown>
  return {
    ...orig,
    writeFileAtomic: vi.fn(async (filePath: string, content: string) => {
      if (electronMock.writeThrows) {
        throw new Error('simulated write failure')
      }
      const { writeFile: fsWriteFile } = await import('fs/promises')
      await fsWriteFile(filePath, content, 'utf8')
    }),
  }
})

describe('secureStorage', () => {
  beforeEach(async () => {
    vi.resetModules()
    electronMock.userDataPath = await mkdtemp(path.join(os.tmpdir(), 'zura-secure-storage-'))
    electronMock.encryptionAvailable = true
    electronMock.writeThrows = false
  })

  afterEach(async () => {
    await rm(electronMock.userDataPath, { recursive: true, force: true })
  })

  it('preserves every key across concurrent mutations', async () => {
    const storage = await import('./secureStorage')

    await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        storage.setSecureValueAsync(`key-${index}`, `value-${index}`)
      )
    )

    await expect(
      Promise.all(
        Array.from({ length: 10 }, (_, index) => storage.getSecureValueAsync(`key-${index}`))
      )
    ).resolves.toEqual(Array.from({ length: 10 }, (_, index) => `value-${index}`))
  })

  it('surfaces corrupt secure storage instead of reporting missing secrets', async () => {
    await writeFile(path.join(electronMock.userDataPath, 'secure-storage.json'), '{invalid json')
    const storage = await import('./secureStorage')

    await expect(storage.getSecureValueAsync('apiKey')).rejects.toThrow(
      'Secure storage contains invalid JSON'
    )
  })

  it('persists encrypted values without exposing the decrypted cache object', async () => {
    const storage = await import('./secureStorage')
    await storage.setSecureValueAsync('apiKey', 'secret')

    const raw = JSON.parse(
      await readFile(path.join(electronMock.userDataPath, 'secure-storage.json'), 'utf8')
    )
    expect(raw.apiKey).not.toBe('secret')
    expect(raw.apiKey).toMatch(/^v1:/)
    await expect(storage.getSecureValueAsync('apiKey')).resolves.toBe('secret')
  })

  it('short corrupt ciphertext must NOT become a credential (no length heuristic)', async () => {
    // "abc123" is short (<100 chars) but does not match a known API key prefix
    // Under the old length heuristic, this would have been returned as plaintext
    await writeFile(
      path.join(electronMock.userDataPath, 'secure-storage.json'),
      JSON.stringify({ apiKey: 'abc123' })
    )
    const storage = await import('./secureStorage')

    // Should not return the corrupt value as a credential
    await expect(storage.getSecureValueAsync('apiKey')).resolves.toBe('')
  })

  it('throws when migration write fails rather than returning plaintext', async () => {
    // Write a legacy plaintext value with a known prefix
    await writeFile(
      path.join(electronMock.userDataPath, 'secure-storage.json'),
      JSON.stringify({ apiKey: 'sk-test-legacy-key-12345' })
    )

    // Make writes fail to simulate migration failure
    electronMock.writeThrows = true

    const storage = await import('./secureStorage')

    await expect(storage.getSecureValueAsync('apiKey')).rejects.toThrow(
      'legacy plaintext entries could not be re-encrypted'
    )
  })

  it('v1:-tagged value that fails decryption is skipped (not returned, not treated as legacy)', async () => {
    // Write a v1:-tagged value that is corrupt (not valid encrypted data)
    await writeFile(
      path.join(electronMock.userDataPath, 'secure-storage.json'),
      JSON.stringify({ apiKey: 'v1:not-valid-encrypted-data' })
    )
    const storage = await import('./secureStorage')

    // Should skip the corrupt v1: entry and return empty
    await expect(storage.getSecureValueAsync('apiKey')).resolves.toBe('')
  })

  it('normal encrypted values with v1: prefix round-trip correctly', async () => {
    const storage = await import('./secureStorage')

    await storage.setSecureValueAsync('openRouterApiKey', 'sk-or-v1-mykey123')
    await storage.setSecureValueAsync('tavilyApiKey', 'tvly-search-key')

    // Verify on-disk format uses v1: prefix
    const raw = JSON.parse(
      await readFile(path.join(electronMock.userDataPath, 'secure-storage.json'), 'utf8')
    )
    expect(raw.openRouterApiKey).toMatch(/^v1:/)
    expect(raw.tavilyApiKey).toMatch(/^v1:/)

    // Force cache invalidation by re-importing
    vi.resetModules()
    const storage2 = await import('./secureStorage')

    await expect(storage2.getSecureValueAsync('openRouterApiKey')).resolves.toBe(
      'sk-or-v1-mykey123'
    )
    await expect(storage2.getSecureValueAsync('tavilyApiKey')).resolves.toBe('tvly-search-key')
  })
})

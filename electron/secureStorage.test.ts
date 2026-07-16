// @vitest-environment node

import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electronMock = vi.hoisted(() => ({
  userDataPath: '',
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => electronMock.userDataPath),
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((value: string) => Buffer.from(`encrypted:${value}`, 'utf8')),
    decryptString: vi.fn((value: Buffer) => {
      const decoded = value.toString('utf8')
      if (!decoded.startsWith('encrypted:')) throw new Error('not encrypted')
      return decoded.slice('encrypted:'.length)
    }),
  },
}))

describe('secureStorage', () => {
  beforeEach(async () => {
    vi.resetModules()
    electronMock.userDataPath = await mkdtemp(path.join(os.tmpdir(), 'zura-secure-storage-'))
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
    await expect(storage.getSecureValueAsync('apiKey')).resolves.toBe('secret')
  })
})

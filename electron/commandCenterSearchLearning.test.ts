import { mkdtemp } from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('commandCenterSearchLearning', () => {
  let userDataPath = ''
  let secureKey: string | null = 'test-learning-key-base64url-value'

  beforeEach(async () => {
    userDataPath = await mkdtemp(path.join(os.tmpdir(), 'zura-cc-learning-'))
    secureKey = 'test-learning-key-base64url-value'
    vi.resetModules()
    vi.doMock('electron', () => ({
      app: {
        getPath: vi.fn(() => userDataPath),
      },
    }))
    vi.doMock('./secureStorage', () => ({
      getSecureValueAsync: vi.fn(async () => secureKey),
      setSecureValueAsync: vi.fn(async (_name: string, value: string) => {
        secureKey = value
        return true
      }),
    }))
  })

  afterEach(() => {
    vi.resetModules()
    vi.doUnmock('electron')
    vi.doUnmock('./secureStorage')
  })

  async function loadLearning() {
    return import('./commandCenterSearchLearning')
  }

  it('boosts frequently selected items strongly on empty browse', async () => {
    const learning = await loadLearning()
    learning.clearCommandCenterSearchLearningCache()

    for (let i = 0; i < 6; i += 1) {
      await learning.recordCommandCenterSelection('app:habit', '')
    }
    await learning.recordCommandCenterSelection('app:once', '')

    const habitBoost = await learning.personalizationBoost('app:habit', '')
    const onceBoost = await learning.personalizationBoost('app:once', '')

    expect(habitBoost).toBeGreaterThan(onceBoost)
    expect(habitBoost).toBeGreaterThan(100)
    expect(habitBoost).toBeLessThanOrEqual(1200)
  })

  it('keeps typed-search boost subordinate to strong lexical scores', async () => {
    const learning = await loadLearning()
    learning.clearCommandCenterSearchLearningCache()

    for (let i = 0; i < 20; i += 1) {
      await learning.recordCommandCenterSelection('app:habit', 'hab')
    }

    const boost = await learning.personalizationBoost('app:habit', 'hab')
    expect(boost).toBeGreaterThan(0)
    expect(boost).toBeLessThanOrEqual(120)
    // Exact app name match is 1000; personalization must not drown it.
    expect(boost).toBeLessThan(1000)
  })

  it('returns zero for identities that were never selected', async () => {
    const learning = await loadLearning()
    learning.clearCommandCenterSearchLearningCache()
    expect(await learning.personalizationBoost('app:unknown', '')).toBe(0)
  })
})

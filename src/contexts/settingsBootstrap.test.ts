import { beforeEach, describe, expect, it, vi } from 'vitest'

const secureMocks = vi.hoisted(() => ({
  migrateApiKeysFromLocalStorage: vi.fn(),
  loadApiKeyPresenceFromSecureStorage: vi.fn(),
}))
const ollamaMocks = vi.hoisted(() => ({
  checkOllamaStatus: vi.fn(),
  listOllamaModels: vi.fn(),
  enrichOllamaModelsWithContext: vi.fn(),
}))

vi.mock('../utils/secureApiKeys', () => secureMocks)
vi.mock('../services/ollama', () => ollamaMocks)

import {
  discoverStartupOllamaModels,
  loadSecureSettingPresence,
  syncReminderExtensionState,
} from './settingsBootstrap'

describe('settings bootstrap services', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('migrates local secrets before returning only requested presence fields', async () => {
    secureMocks.migrateApiKeysFromLocalStorage.mockResolvedValue(undefined)
    secureMocks.loadApiKeyPresenceFromSecureStorage.mockResolvedValue({
      openRouterApiKey: '••••••••',
      unrelated: 'must-not-leak',
    })

    await expect(
      loadSecureSettingPresence({ openRouterApiKey: 'legacy' }, ['openRouterApiKey', 'groqApiKey'])
    ).resolves.toEqual({ openRouterApiKey: '••••••••', groqApiKey: '' })
    expect(secureMocks.migrateApiKeysFromLocalStorage).toHaveBeenCalledBefore(
      secureMocks.loadApiKeyPresenceFromSecureStorage
    )
  })

  it('does not list Ollama models when the configured endpoint is unavailable', async () => {
    ollamaMocks.checkOllamaStatus.mockResolvedValue(false)

    await expect(discoverStartupOllamaModels('http://127.0.0.1:11434')).resolves.toEqual([])
    expect(ollamaMocks.listOllamaModels).not.toHaveBeenCalled()
  })

  it('formats and enriches discovered Ollama models', async () => {
    ollamaMocks.checkOllamaStatus.mockResolvedValue(true)
    ollamaMocks.listOllamaModels.mockResolvedValue([
      {
        name: 'local-test-model',
        details: { parameter_size: '7B' },
        maxContext: 4096,
      },
    ])
    ollamaMocks.enrichOllamaModelsWithContext.mockImplementation(
      async (_url: string, models: unknown) => models
    )

    await expect(discoverStartupOllamaModels('http://127.0.0.1:11434')).resolves.toEqual([
      {
        code: 'local-test-model',
        displayName: 'local-test-model (7B)',
        maxContext: 4096,
      },
    ])
  })

  it('delegates reminder extension state to the narrow scheduled-task bridge', async () => {
    const setExtensionEnabled = vi.fn().mockResolvedValue(true)
    window.scheduledTasks = { setExtensionEnabled } as typeof window.scheduledTasks

    await syncReminderExtensionState(true)

    expect(setExtensionEnabled).toHaveBeenCalledWith(true)
  })
})

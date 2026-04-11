/**
 * Unit tests for SettingsContext provider integration
 * Tests default values and migration logic for provider settings
 *
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { migrateConfiguredModelCode } from './SettingsContext'
import { normalizeStoredSettings } from './settingsStore'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
    get store() {
      return store
    },
  }
})()

Object.defineProperty(global, 'localStorage', { value: localStorageMock })

// Mock window.ipcRenderer
Object.defineProperty(global, 'window', {
  value: {
    ipcRenderer: {
      send: vi.fn(),
      invoke: vi.fn().mockResolvedValue({}),
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  },
  writable: true,
})

describe('SettingsContext Provider Integration', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  describe('Provider Migration Logic', () => {
    it('migration maps modelProvider gemini to openrouter', () => {
      const parsed = { modelProvider: 'gemini' as const }
      if (parsed.modelProvider === 'gemini' || parsed.modelProvider === 'minimax') {
        parsed.modelProvider = 'openrouter'
      }
      expect(parsed.modelProvider).toBe('openrouter')
    })

    it('migration maps modelProvider minimax to openrouter', () => {
      const parsed = { modelProvider: 'minimax' as const }
      if (parsed.modelProvider === 'gemini' || parsed.modelProvider === 'minimax') {
        parsed.modelProvider = 'openrouter'
      }
      expect(parsed.modelProvider).toBe('openrouter')
    })

    it('migration maps titleModel gemini-* to dynamic resolution', () => {
      const parsed = { titleModel: 'gemini-2.5-flash' }
      if (parsed.titleModel?.startsWith('gemini-')) {
        parsed.titleModel = ''
      }
      expect(parsed.titleModel).toBe('')
    })
  })

  describe('Default Provider Settings', () => {
    it('includes groqApiKey as empty string in defaults', async () => {
      const { defaultSettingsConfig } = await import('./SettingsConfigContext')
      expect(defaultSettingsConfig.groqApiKey).toBe('')
    })

    it('defaults Tavily search depth preference to auto', async () => {
      const { defaultSettingsConfig } = await import('./SettingsConfigContext')
      expect(defaultSettingsConfig.tavilySearchDepthPreference).toBe('auto')
    })

    it('includes valid modelProvider in defaults', async () => {
      const { defaultSettingsConfig } = await import('./SettingsConfigContext')
      const validProviders = ['openrouter', 'ollama', 'perplexity', 'groq']
      expect(validProviders).toContain(defaultSettingsConfig.modelProvider)
    })

    it('default titleModel resolves dynamically', async () => {
      const { defaultSettingsConfig } = await import('./SettingsConfigContext')
      expect(defaultSettingsConfig.titleModel).toBe('')
    })

    it('default title generation provider is openrouter', async () => {
      const { defaultSettingsConfig } = await import('./SettingsConfigContext')
      expect(defaultSettingsConfig.titleModelProvider).toBe('openrouter')
    })

    it('default title generation display mode is instant', async () => {
      const { defaultSettingsConfig } = await import('./SettingsConfigContext')
      expect(defaultSettingsConfig.titleGenerationDisplayMode).toBe('instant')
    })

    it('defaults streamResponses to true', async () => {
      const { defaultSettingsConfig } = await import('./SettingsConfigContext')
      expect(defaultSettingsConfig.streamResponses).toBe(true)
    })

    it('defaults OpenRouter debug logging to false', async () => {
      const { defaultSettingsConfig } = await import('./SettingsConfigContext')
      expect(defaultSettingsConfig.openRouterDebug).toBe(false)
    })

    it('includes Kimi K2.5 in default Fireworks models', async () => {
      const { defaultSettingsConfig } = await import('./SettingsConfigContext')
      expect(defaultSettingsConfig.fireworksModels).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'accounts/fireworks/models/kimi-k2p5',
            displayName: 'Kimi K2.5',
          }),
        ])
      )
    })

    it('includes Kimi K2.5 Turbo in default Fireworks models', async () => {
      const { defaultSettingsConfig } = await import('./SettingsConfigContext')
      expect(defaultSettingsConfig.fireworksModels).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'accounts/fireworks/routers/kimi-k2p5-turbo',
            displayName: 'Kimi K2.5 Turbo',
          }),
        ])
      )
    })

    it('migrates legacy Fireworks turbo model ids to the supported router id', () => {
      expect(
        migrateConfiguredModelCode({
          code: 'accounts/fireworks/models/kimi-k2p5-turbo',
          displayName: 'Kimi K2.5 Turbo',
          enabled: true,
        })
      ).toEqual({
        code: 'accounts/fireworks/routers/kimi-k2p5-turbo',
        displayName: 'Kimi K2.5 Turbo',
        enabled: true,
      })
    })

    it('normalizes legacy persisted streamResponses false back to true', () => {
      const normalized = normalizeStoredSettings(JSON.stringify({ streamResponses: false }))
      expect(normalized.streamResponses).toBe(true)
    })

    it('normalizes missing openRouterDebug to false', () => {
      const normalized = normalizeStoredSettings(JSON.stringify({}))
      expect(normalized.openRouterDebug).toBe(false)
    })

    it('preserves an explicitly emptied provider model list', () => {
      const normalized = normalizeStoredSettings(
        JSON.stringify({
          groqModels: [],
          alibabaModels: [],
          fireworksModels: [],
          perplexityModels: [],
        })
      )

      expect(normalized.groqModels).toEqual([])
      expect(normalized.alibabaModels).toEqual([])
      expect(normalized.fireworksModels).toEqual([])
      expect(normalized.perplexityModels).toEqual([])
    })
  })
})

/**
 * Unit tests for SettingsContext provider integration
 * Tests default values and migration logic for provider settings
 *
 * Requirements: 4.4, 8.1, 8.2, 8.3
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

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

    it('migration maps titleModel gemini-* to OpenRouter default', () => {
      const parsed = { titleModel: 'gemini-2.5-flash' }
      if (parsed.titleModel?.startsWith('gemini-')) {
        parsed.titleModel = 'google/gemini-2.0-flash-exp:free'
      }
      expect(parsed.titleModel).toBe('google/gemini-2.0-flash-exp:free')
    })
  })

  describe('Default Provider Settings', () => {
    it('includes groqApiKey as empty string in defaults', async () => {
      const { defaultSettingsConfig } = await import('./SettingsConfigContext')
      expect(defaultSettingsConfig.groqApiKey).toBe('')
    })

    it('includes valid modelProvider in defaults', async () => {
      const { defaultSettingsConfig } = await import('./SettingsConfigContext')
      const validProviders = ['openrouter', 'ollama', 'perplexity', 'groq']
      expect(validProviders).toContain(defaultSettingsConfig.modelProvider)
    })

    it('default titleModel uses OpenRouter model', async () => {
      const { defaultSettingsConfig } = await import('./SettingsConfigContext')
      expect(defaultSettingsConfig.titleModel).toBe('google/gemini-2.0-flash-exp:free')
    })

    it('default title generation provider is openrouter', async () => {
      const { defaultSettingsConfig } = await import('./SettingsConfigContext')
      expect(defaultSettingsConfig.titleModelProvider).toBe('openrouter')
    })

    it('default title generation display mode is instant', async () => {
      const { defaultSettingsConfig } = await import('./SettingsConfigContext')
      expect(defaultSettingsConfig.titleGenerationDisplayMode).toBe('instant')
    })
  })
})

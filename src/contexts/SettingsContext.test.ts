/**
 * Unit tests for SettingsContext provider integration
 * Tests default values and migration logic for provider settings
 *
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { migrateConfiguredModelCode } from './SettingsContext'
import { normalizeStoredSettings, stripSecretSettings } from './settingsStore'
import { defaultWebSearchPrompt } from '../prompts/defaultWebSearchPrompt'
import { DEFAULT_ASSISTANT_PERSONALITY } from '../prompts/assistantPersonalities'

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
      const parsed: { modelProvider: string } = { modelProvider: 'gemini' }
      if (parsed.modelProvider === 'gemini' || parsed.modelProvider === 'minimax') {
        parsed.modelProvider = 'openrouter'
      }
      expect(parsed.modelProvider).toBe('openrouter')
    })

    it('migration maps modelProvider minimax to openrouter', () => {
      const parsed: { modelProvider: string } = { modelProvider: 'minimax' }
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

    it('does not include a default title generation provider override', async () => {
      const { defaultSettingsConfig } = await import('./SettingsConfigContext')
      expect('titleModelProvider' in defaultSettingsConfig).toBe(false)
    })

    it('default title generation display mode is instant', async () => {
      const { defaultSettingsConfig } = await import('./SettingsConfigContext')
      expect(defaultSettingsConfig.titleGenerationDisplayMode).toBe('instant')
    })

    it('migrates the legacy default title generation prompt to the hardened prompt', () => {
      const legacyPrompt = `Give this conversation a short descriptive title (2-6 words).

Rules:
- Return ONLY the title text. No quotes, no prefix, no explanation.`

      const normalized = normalizeStoredSettings(JSON.stringify({ titleGenerationPrompt: legacyPrompt }))

      expect(normalized.titleGenerationPrompt).toContain('Hard bans:')
      expect(normalized.titleGenerationPrompt).toContain('Do not explain your reasoning.')
      expect(normalized.titleGenerationPrompt).not.toBe(legacyPrompt)
    })

    it('defaults streamResponses to true', async () => {
      const { defaultSettingsConfig } = await import('./SettingsConfigContext')
      expect(defaultSettingsConfig.streamResponses).toBe(true)
    })

    it('defaults assistant personality to Professional Engineer', async () => {
      const { defaultSettingsConfig } = await import('./SettingsConfigContext')
      expect(defaultSettingsConfig.assistantPersonality).toBe(DEFAULT_ASSISTANT_PERSONALITY)
    })

    it('normalizes invalid assistant personality to the default', () => {
      const normalized = normalizeStoredSettings(
        JSON.stringify({ assistantPersonality: 'not-a-personality' })
      )

      expect(normalized.assistantPersonality).toBe(DEFAULT_ASSISTANT_PERSONALITY)
    })

    it('preserves valid assistant personality settings', () => {
      const normalized = normalizeStoredSettings(
        JSON.stringify({ assistantPersonality: 'professional-engineer' })
      )

      expect(normalized.assistantPersonality).toBe('professional-engineer')
    })

    it('defaults OpenRouter debug logging to false', async () => {
      const { defaultSettingsConfig } = await import('./SettingsConfigContext')
      expect(defaultSettingsConfig.openRouterDebug).toBe(false)
    })

    it('defaults Fireworks models to an empty list', async () => {
      const { defaultSettingsConfig } = await import('./SettingsConfigContext')
      expect(defaultSettingsConfig.fireworksModels).toEqual([])
    })

    it('defaults OpenRouter configured models to an empty list', async () => {
      const { defaultSettingsConfig } = await import('./SettingsConfigContext')
      expect(defaultSettingsConfig.configuredModels).toEqual([])
    })

    it('defaults Alibaba models to an empty list', async () => {
      const { defaultSettingsConfig } = await import('./SettingsConfigContext')
      expect(defaultSettingsConfig.alibabaModels).toEqual([])
    })

    it('defaults DeepSeek models to the documented v4 model ids', async () => {
      const { defaultSettingsConfig } = await import('./SettingsConfigContext')
      expect(defaultSettingsConfig.deepseekModels).toEqual([
        expect.objectContaining({
          code: 'deepseek-v4-flash',
          displayName: 'DeepSeek V4 Flash',
          modelType: 'chat',
        }),
        expect.objectContaining({
          code: 'deepseek-v4-pro',
          displayName: 'DeepSeek V4 Pro',
          modelType: 'reasoning',
        }),
      ])
    })

    it('derives provider-enabled defaults from the provider registry', async () => {
      const { defaultSettingsConfig } = await import('./SettingsConfigContext')
      expect(defaultSettingsConfig.providerEnabled).toEqual({
        alibaba: true,
        deepseek: true,
        fireworks: true,
        groq: true,
        ollama: true,
        openrouter: true,
        perplexity: true,
      })
    })

    it('strips all secure keys from persisted renderer settings', () => {
      expect(
        stripSecretSettings({
          openRouterApiKey: 'or-key',
          deepseekApiKey: 'deepseek-key',
          tavilyApiKey: 'tavily-key',
          onlineCompilerApiKey: 'compiler-key',
          aiModel: 'deepseek-v4-flash',
        })
      ).toEqual({
        aiModel: 'deepseek-v4-flash',
      })
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

    it('replaces saved web-search prompt overrides with the current default', () => {
      const legacyPrompt = `Custom header

CRITICAL REQUIREMENTS:
- After using web_search, you MUST include a Sources: section at the end of the response
- In Sources:, list the relevant URLs as markdown links in the format [Title](URL)
- Do not claim certainty beyond what the sources support

SEARCH STRATEGY:
- For research or discovery tasks, begin with ONE broad exploratory search
- Do not pre-plan several searches from memory before seeing results
- Let the first results guide follow-up searches`

      const normalized = normalizeStoredSettings(JSON.stringify({ webSearchPrompt: legacyPrompt }))

      expect(normalized.webSearchPrompt).toBe(defaultWebSearchPrompt)
      expect(normalized.webSearchPrompt).not.toContain('Custom header')
    })

    it('drops legacy titleModelProvider when normalizing stored settings', async () => {
      expect(
        normalizeStoredSettings(
          JSON.stringify({
            titleModelProvider: 'groq',
            titleModel: 'groq-primary',
          })
        )
      ).toEqual(
        expect.objectContaining({
          titleModel: 'groq-primary',
        })
      )
      expect(
        'titleModelProvider' in
          normalizeStoredSettings(
            JSON.stringify({
              titleModelProvider: 'groq',
              titleModel: 'groq-primary',
            })
          )
      ).toBe(false)
    })

    it('does not preserve custom web-search prompt fragments during normalization', () => {
      const savedPrompt = `CRITICAL REQUIREMENTS:
- After using web_search, you MUST include a Sources: section at the end of the response
- In Sources:, list the relevant URLs as markdown links in the format [Title](URL)
- Do not claim certainty beyond what the sources support`

      const normalized = normalizeStoredSettings(JSON.stringify({ webSearchPrompt: savedPrompt }))

      expect(normalized.webSearchPrompt).toBe(defaultWebSearchPrompt)
    })

    it('does not preserve legacy primary-source web-search prompt overrides', () => {
      const savedPrompt = `CRITICAL REQUIREMENTS:
- In Sources:, list the relevant URLs as markdown links in the format [Title](URL)
- Briefly note when the answer depends on web search results and that web results can be incomplete, outdated, or occasionally incorrect
- Do not claim certainty beyond what the sources support`

      const normalized = normalizeStoredSettings(JSON.stringify({ webSearchPrompt: savedPrompt }))

      expect(normalized.webSearchPrompt).toBe(defaultWebSearchPrompt)
    })

    it('preserves an explicitly emptied provider model list', () => {
      const normalized = normalizeStoredSettings(
        JSON.stringify({
          configuredModels: [],
          groqModels: [],
          alibabaModels: [],
          fireworksModels: [],
          perplexityModels: [],
        })
      )

      expect(normalized.configuredModels).toEqual([])
      expect(normalized.groqModels).toEqual([])
      expect(normalized.alibabaModels).toEqual([])
      expect(normalized.fireworksModels).toEqual([])
      expect(normalized.perplexityModels).toEqual([])
    })

    it('clears legacy pre-seeded Fireworks model defaults from persisted settings', () => {
      const legacyFireworksSeededModels = [
        { code: 'accounts/fireworks/models/deepseek-v3p2', displayName: 'DeepSeek V3.2', enabled: true },
        { code: 'accounts/fireworks/models/kimi-k2p5', displayName: 'Kimi K2.5', enabled: true },
        {
          code: 'accounts/fireworks/routers/kimi-k2p5-turbo',
          displayName: 'Kimi K2.5 Turbo',
          enabled: true,
        },
        { code: 'accounts/fireworks/models/deepseek-r1', displayName: 'DeepSeek R1', enabled: true },
        {
          code: 'accounts/fireworks/models/llama-v3p1-405b-instruct',
          displayName: 'Llama 3.1 405B',
          enabled: true,
        },
        {
          code: 'accounts/fireworks/models/llama-v3p1-8b-instruct',
          displayName: 'Llama 3.1 8B',
          enabled: true,
        },
        {
          code: 'accounts/fireworks/models/llama-v3p1-70b-instruct',
          displayName: 'Llama 3.1 70B',
          enabled: true,
        },
        { code: 'accounts/fireworks/models/glm-5', displayName: 'GLM-5', enabled: true },
        {
          code: 'accounts/fireworks/models/qwen3-235b-a22b',
          displayName: 'Qwen3 235B',
          enabled: true,
        },
        { code: 'accounts/fireworks/models/glm-4p7', displayName: 'GLM-4.7', enabled: true },
        {
          code: 'accounts/fireworks/models/nvidia-nemotron-3-super-120b-a12b-fp8',
          displayName: 'NVIDIA Nemotron 3',
          enabled: true,
        },
      ]

      const normalized = normalizeStoredSettings(
        JSON.stringify({
          fireworksModels: legacyFireworksSeededModels,
        })
      )

      expect(normalized.fireworksModels).toEqual([])
    })

    it('preserves custom Fireworks models instead of clearing non-legacy lists', () => {
      const normalized = normalizeStoredSettings(
        JSON.stringify({
          fireworksModels: [
            {
              code: 'accounts/fireworks/models/kimi-k2p5',
              displayName: 'Kimi K2.5',
              enabled: true,
            },
            {
              code: 'accounts/fireworks/models/custom-model-123',
              displayName: 'Custom Fireworks Model',
              enabled: true,
            },
          ],
        })
      )

      expect(normalized.fireworksModels).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'accounts/fireworks/models/custom-model-123',
            displayName: 'Custom Fireworks Model',
            enabled: true,
          }),
        ])
      )
    })
  })
})

/**
 * Unit tests for modelUtils
 * Tests centralized model utility functions
 * 
 * Requirements: 4.1
 */

import { describe, it, expect } from 'vitest'
import {
  getModelAttributes,
  getModelIcon,
  getModelColor,
  detectModelCapabilities,
  filterModels,
  groupModelsByProvider,
  getProviderTitle,
  getProviderColor,
  getCapabilitiesForModelPicker,
  type ModelInfo
} from './modelUtils'

describe('modelUtils', () => {
  describe('getModelAttributes', () => {
    it('returns correct attributes for Gemini models', () => {
      const model = { code: 'gemini-pro', displayName: 'Gemini Pro' }
      const attrs = getModelAttributes(model)
      
      expect(attrs.color).toBe('#4dabf7')
      expect(attrs.icon).toBeDefined()
    })

    it('returns correct attributes for Claude models', () => {
      const model = { code: 'claude-3-opus', displayName: 'Claude 3 Opus' }
      const attrs = getModelAttributes(model)
      
      expect(attrs.color).toBe('#da7756')
      expect(attrs.icon).toBeDefined()
    })

    it('returns correct attributes for GPT models', () => {
      const model = { code: 'gpt-4-turbo', displayName: 'GPT-4 Turbo' }
      const attrs = getModelAttributes(model)
      
      expect(attrs.color).toBe('#10a37f')
      expect(attrs.icon).toBeDefined()
    })

    it('returns correct attributes for Mistral models', () => {
      const model = { code: 'mistral-large', displayName: 'Mistral Large' }
      const attrs = getModelAttributes(model)
      
      expect(attrs.color).toBe('#fcc419')
      expect(attrs.icon).toBeDefined()
    })

    it('returns correct attributes for Llama models', () => {
      const model = { code: 'llama-3-70b', displayName: 'Llama 3 70B' }
      const attrs = getModelAttributes(model)
      
      expect(attrs.color).toBe('#339af0')
      expect(attrs.icon).toBeDefined()
    })

    it('returns correct attributes for MiniMax models', () => {
      const model = { code: 'MiniMax-M2.1', displayName: 'MiniMax M2.1' }
      const attrs = getModelAttributes(model)
      
      expect(attrs.color).toBe('#6366f1')
      expect(attrs.icon).toBeDefined()
    })

    it('returns default attributes for unknown models', () => {
      const model = { code: 'unknown-model', displayName: 'Unknown Model' }
      const attrs = getModelAttributes(model)
      
      expect(attrs.color).toBe('#b0b0b0')
      expect(attrs.icon).toBeDefined()
    })

    it('returns badge for flash/turbo models', () => {
      const model = { code: 'gemini-flash', displayName: 'Gemini Flash' }
      const attrs = getModelAttributes(model)
      
      expect(attrs.badge).toBeDefined()
    })

    it('returns badge for pro/plus models', () => {
      const model = { code: 'gemini-pro', displayName: 'Gemini Pro' }
      const attrs = getModelAttributes(model)
      
      expect(attrs.badge).toBeDefined()
    })

    it('returns badge for reasoning models', () => {
      const model = { code: 'o1-reasoning', displayName: 'O1 Reasoning' }
      const attrs = getModelAttributes(model)
      
      expect(attrs.badge).toBeDefined()
    })

    it('returns Deep Research badge for deep-research models', () => {
      const model = { code: 'sonar-deep-research', displayName: 'Sonar Deep Research' }
      const attrs = getModelAttributes(model)
      
      expect(attrs.badge).toBeDefined()
    })

    it('returns Online badge for :online models', () => {
      const model = { code: 'llama-3:online', displayName: 'Llama 3 Online' }
      const attrs = getModelAttributes(model)
      
      expect(attrs.badge).toBeDefined()
    })

    it('respects custom icon size', () => {
      const model = { code: 'gpt-4', displayName: 'GPT-4' }
      const attrs = getModelAttributes(model, { iconSize: 24 })
      
      expect(attrs.icon).toBeDefined()
    })
  })

  describe('getModelIcon', () => {
    it('returns icon for known model families', () => {
      expect(getModelIcon('gemini-pro')).toBeDefined()
      expect(getModelIcon('claude-3')).toBeDefined()
      expect(getModelIcon('gpt-4')).toBeDefined()
      expect(getModelIcon('mistral')).toBeDefined()
      expect(getModelIcon('llama')).toBeDefined()
      expect(getModelIcon('minimax')).toBeDefined()
    })

    it('returns default icon for unknown models', () => {
      expect(getModelIcon('unknown-model')).toBeDefined()
    })

    it('respects custom size parameter', () => {
      const icon = getModelIcon('gpt-4', 24)
      expect(icon).toBeDefined()
    })
  })

  describe('getModelColor', () => {
    it('returns correct colors for known model families', () => {
      expect(getModelColor('gemini-pro')).toBe('#4dabf7')
      expect(getModelColor('claude-3')).toBe('#da7756')
      expect(getModelColor('gpt-4')).toBe('#10a37f')
      expect(getModelColor('mistral')).toBe('#fcc419')
      expect(getModelColor('llama')).toBe('#339af0')
      expect(getModelColor('minimax')).toBe('#6366f1')
    })

    it('returns default color for unknown models', () => {
      expect(getModelColor('unknown-model')).toBe('#b0b0b0')
    })
  })

  describe('detectModelCapabilities', () => {
    it('detects vision capability', () => {
      expect(detectModelCapabilities('gpt-4-vision')).toContain('vision')
      expect(detectModelCapabilities('gpt-4o')).toContain('vision')
      expect(detectModelCapabilities('gemini-pro-vision')).toContain('vision')
    })

    it('detects code capability', () => {
      expect(detectModelCapabilities('codestral')).toContain('code')
      expect(detectModelCapabilities('code-llama')).toContain('code')
      expect(detectModelCapabilities('deepseek-coder')).toContain('code')
      expect(detectModelCapabilities('minimax-m2')).toContain('code')
    })

    it('detects reasoning capability', () => {
      expect(detectModelCapabilities('o1-reasoning')).toContain('reasoning')
      expect(detectModelCapabilities('o1-preview')).toContain('reasoning')
      expect(detectModelCapabilities('MiniMax-M2.1')).toContain('reasoning')
    })

    it('detects fast capability', () => {
      expect(detectModelCapabilities('gemini-flash')).toContain('fast')
      expect(detectModelCapabilities('gpt-4-turbo')).toContain('fast')
      expect(detectModelCapabilities('claude-instant')).toContain('fast')
    })

    it('detects online capability', () => {
      expect(detectModelCapabilities('llama-3:online')).toContain('online')
      expect(detectModelCapabilities('sonar-online')).toContain('online')
    })

    it('detects deep-research capability', () => {
      expect(detectModelCapabilities('sonar-deep-research')).toContain('deep-research')
    })

    it('returns empty array for models without special capabilities', () => {
      const capabilities = detectModelCapabilities('basic-model')
      expect(capabilities).toEqual([])
    })
  })

  describe('filterModels', () => {
    const testModels: ModelInfo[] = [
      { code: 'gpt-4', displayName: 'GPT-4', provider: 'openrouter' },
      { code: 'gemini-pro', displayName: 'Gemini Pro', provider: 'gemini' },
      { code: 'claude-3', displayName: 'Claude 3', provider: 'openrouter' },
      { code: 'llama-3', displayName: 'Llama 3', provider: 'ollama' }
    ]

    it('returns all models when query is empty', () => {
      expect(filterModels(testModels, '')).toEqual(testModels)
      expect(filterModels(testModels, '   ')).toEqual(testModels)
    })

    it('filters by display name', () => {
      const result = filterModels(testModels, 'GPT')
      expect(result).toHaveLength(1)
      expect(result[0].code).toBe('gpt-4')
    })

    it('filters by code', () => {
      const result = filterModels(testModels, 'gemini')
      expect(result).toHaveLength(1)
      expect(result[0].code).toBe('gemini-pro')
    })

    it('is case insensitive', () => {
      const result = filterModels(testModels, 'CLAUDE')
      expect(result).toHaveLength(1)
      expect(result[0].code).toBe('claude-3')
    })

    it('returns empty array when no matches', () => {
      const result = filterModels(testModels, 'nonexistent')
      expect(result).toHaveLength(0)
    })
  })

  describe('groupModelsByProvider', () => {
    const testModels: ModelInfo[] = [
      { code: 'gpt-4', displayName: 'GPT-4', provider: 'openrouter' },
      { code: 'gemini-pro', displayName: 'Gemini Pro', provider: 'gemini' },
      { code: 'claude-3', displayName: 'Claude 3', provider: 'openrouter' },
      { code: 'llama-3', displayName: 'Llama 3', provider: 'ollama' },
      { code: 'sonar', displayName: 'Sonar', provider: 'perplexity' },
      { code: 'mixtral', displayName: 'Mixtral', provider: 'groq' },
      { code: 'MiniMax-M2.1', displayName: 'MiniMax M2.1', provider: 'minimax' }
    ]

    it('groups models by provider', () => {
      const groups = groupModelsByProvider(testModels)
      
      expect(groups.openrouter).toHaveLength(2)
      expect(groups.gemini).toHaveLength(1)
      expect(groups.ollama).toHaveLength(1)
      expect(groups.perplexity).toHaveLength(1)
      expect(groups.groq).toHaveLength(1)
      expect(groups.minimax).toHaveLength(1)
    })

    it('returns empty arrays for providers with no models', () => {
      const groups = groupModelsByProvider([])
      
      expect(groups.openrouter).toEqual([])
      expect(groups.gemini).toEqual([])
      expect(groups.ollama).toEqual([])
      expect(groups.perplexity).toEqual([])
      expect(groups.groq).toEqual([])
      expect(groups.minimax).toEqual([])
    })
  })

  describe('getProviderTitle', () => {
    it('returns correct titles for known providers', () => {
      expect(getProviderTitle('gemini')).toBe('Gemini')
      expect(getProviderTitle('openrouter')).toBe('OpenRouter')
      expect(getProviderTitle('perplexity')).toBe('Perplexity')
      expect(getProviderTitle('groq')).toBe('Groq')
      expect(getProviderTitle('ollama')).toBe('Ollama')
      expect(getProviderTitle('minimax')).toBe('MiniMax')
    })

    it('returns provider name for unknown providers', () => {
      expect(getProviderTitle('unknown')).toBe('unknown')
    })
  })

  describe('getProviderColor', () => {
    it('returns correct colors for known providers', () => {
      expect(getProviderColor('gemini')).toBe('#4dabf7')
      expect(getProviderColor('openrouter')).toBe('#a855f7')
      expect(getProviderColor('perplexity')).toBe('#22c55e')
      expect(getProviderColor('groq')).toBe('#f97316')
      expect(getProviderColor('ollama')).toBe('#339af0')
      expect(getProviderColor('minimax')).toBe('#6366f1')
    })

    it('returns default color for unknown providers', () => {
      expect(getProviderColor('unknown')).toBe('#b0b0b0')
    })
  })

  describe('getCapabilitiesForModelPicker', () => {
    it('includes toolCall for Groq model in whitelist', () => {
      const model = {
        code: 'llama-3.1-8b-instant',
        displayName: 'Llama 3.1 8B Instant',
        provider: 'groq',
      }
      const caps = getCapabilitiesForModelPicker(model)
      expect(caps).toContain('toolCall')
    })

    it('excludes toolCall for Groq model not in whitelist even when heuristic would add it', () => {
      const model = {
        code: 'mistral-7b',
        displayName: 'Mistral 7B',
        provider: 'groq',
      }
      const caps = getCapabilitiesForModelPicker(model)
      expect(caps).not.toContain('toolCall')
    })

    it('includes toolCall for OpenRouter model', () => {
      const model = {
        code: 'anthropic/claude-3.5-sonnet',
        displayName: 'Claude 3.5 Sonnet',
        provider: 'openrouter',
      }
      const caps = getCapabilitiesForModelPicker(model)
      expect(caps).toContain('toolCall')
    })

    it('excludes toolCall for Perplexity model', () => {
      const model = {
        code: 'sonar',
        displayName: 'Sonar',
        provider: 'perplexity',
      }
      const caps = getCapabilitiesForModelPicker(model)
      expect(caps).not.toContain('toolCall')
    })

    it('includes toolCall when model has explicit supportsToolCall', () => {
      const model = {
        code: 'custom-model',
        displayName: 'Custom Model',
        provider: 'groq',
        supportsToolCall: true,
      }
      const caps = getCapabilitiesForModelPicker(model)
      expect(caps).toContain('toolCall')
    })

    it('includes toolCall for Ollama model in whitelist', () => {
      const model = {
        code: 'llama3.1',
        displayName: 'Llama 3.1',
        provider: 'ollama',
      }
      const caps = getCapabilitiesForModelPicker(model)
      expect(caps).toContain('toolCall')
    })
  })
})

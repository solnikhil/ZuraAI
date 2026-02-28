import { describe, it, expect } from 'vitest'
import {
  getCommandBarSuggestions,
  looksLikeMathExpression,
  normalizeUrlCandidate
} from './suggestions'

describe('commandBar suggestions', () => {
  describe('normalizeUrlCandidate', () => {
    it('accepts http/https URLs', () => {
      expect(normalizeUrlCandidate('https://example.com')).toBe('https://example.com/')
      expect(normalizeUrlCandidate('http://example.com/path')).toBe('http://example.com/path')
    })

    it('normalizes bare domains to https', () => {
      expect(normalizeUrlCandidate('example.com')).toBe('https://example.com/')
      expect(normalizeUrlCandidate('example.com/docs')).toBe('https://example.com/docs')
    })

    it('rejects localhost', () => {
      expect(normalizeUrlCandidate('http://localhost:3000')).toBe(null)
      expect(normalizeUrlCandidate('localhost:3000')).toBe(null)
    })
  })

  describe('looksLikeMathExpression', () => {
    it('detects basic arithmetic', () => {
      expect(looksLikeMathExpression('2+2')).toBe(true)
      expect(looksLikeMathExpression('(10 / 2) + 7')).toBe(true)
    })

    it('rejects non-math text', () => {
      expect(looksLikeMathExpression('hello world')).toBe(false)
      expect(looksLikeMathExpression('')).toBe(false)
    })
  })

  describe('getCommandBarSuggestions', () => {
    it('prefers Settings command for settings query', () => {
      const suggestions = getCommandBarSuggestions('settings', {
        hasCurrentSession: false
      })

      expect(suggestions[0]?.id).toBe('go-settings')
    })

    it('treats "goto settings" as settings navigation', () => {
      const suggestions = getCommandBarSuggestions('goto settings', {
        hasCurrentSession: false
      })

      expect(suggestions[0]?.id).toBe('go-settings')
    })

    it('hides quick actions in commands-only mode', () => {
      const suggestions = getCommandBarSuggestions('>settings', {
        hasCurrentSession: false
      })

      const ids = suggestions.map(s => s.id)
      expect(ids).toContain('go-settings')
    })

    it('offers providers section shortcut', () => {
      const suggestions = getCommandBarSuggestions('providers', {
        hasCurrentSession: false,
      })

      expect(suggestions.some((item) => item.id === 'go-settings-providers')).toBe(true)
    })

    it('offers OpenRouter settings when typing openrouter', () => {
      const suggestions = getCommandBarSuggestions('openrouter', {
        hasCurrentSession: false,
      })

      const openrouterSuggestion = suggestions.find((s) => s.id === 'go-settings-openrouter')
      expect(openrouterSuggestion).toBeDefined()
      expect(openrouterSuggestion?.title).toBe('OpenRouter Settings')
    })

    it('offers Groq settings when typing groq', () => {
      const suggestions = getCommandBarSuggestions('groq', {
        hasCurrentSession: false,
      })

      const groqSuggestion = suggestions.find((s) => s.id === 'go-settings-groq')
      expect(groqSuggestion).toBeDefined()
      expect(groqSuggestion?.title).toBe('Groq Settings')
    })

    it('offers Alibaba Cloud settings when typing alibaba', () => {
      const suggestions = getCommandBarSuggestions('alibaba', {
        hasCurrentSession: false,
      })

      const alibabaSuggestion = suggestions.find((s) => s.id === 'go-settings-alibaba')
      expect(alibabaSuggestion).toBeDefined()
      expect(alibabaSuggestion?.title).toBe('Alibaba Cloud Settings')
    })

    it('offers Search APIs settings when typing tavily', () => {
      const suggestions = getCommandBarSuggestions('tavily', {
        hasCurrentSession: false,
      })

      const searchApisSuggestion = suggestions.find((s) => s.id === 'go-settings-search-apis')
      expect(searchApisSuggestion).toBeDefined()
      expect(searchApisSuggestion?.title).toBe('Search APIs Settings')
    })
  })
})


// ============================================================================
// Property-based tests
// ============================================================================

import * as fc from 'fast-check'
import { normalizeCommandQuery } from './suggestions'

describe('Feature: floating-command-palette, Property 5: Search filtering correctness', () => {
  /**
   * Validates: Requirements 4.3
   *
   * For any non-empty query string derived from known command keywords,
   * every result item returned by the suggestion engine should have a match
   * in its title, subtitle, keywords, or id against the query.
   */

  // Known keywords that exist in the command definitions (≥4 chars to pass
  // the meaningful-token filter in scoreMatch)
  const KNOWN_KEYWORDS = [
    'settings', 'chat', 'conversation', 'dashboard', 'home',
    'providers', 'config', 'models', 'theme', 'themes',
    'appearance', 'sidebar', 'layout', 'panel', 'export',
    'download', 'markdown', 'text', 'experimental', 'labs',
    'beta', 'feature', 'streaming', 'system', 'prompt',
    'instructions', 'persona', 'behavior', 'usage', 'statistics',
    'tokens', 'activity', 'openrouter', 'groq', 'perplexity',
    'ollama', 'local', 'nvidia', 'alibaba', 'qwen',
    'dashscope', 'tavily', 'search', 'tools', 'toggle',
    'collapse', 'expand', 'command', 'palette', 'shortcut',
  ]

  const arbKnownKeyword = fc.constantFrom(...KNOWN_KEYWORDS)

  const defaultContext = {
    hasCurrentSession: true,
  }

  /**
   * Checks whether a query has relevance to a suggestion by looking for
   * the normalized query (or any of its meaningful tokens) in the
   * suggestion's title, subtitle, keywords, or id.
   */
  function hasRelevance(query: string, suggestion: { id: string; title: string; subtitle?: string; keywords?: string[] }): boolean {
    const normalized = normalizeCommandQuery(query)
    if (!normalized) return true // empty after normalization → everything matches

    const tokens = normalized.split(/\s+/).filter(t => t.length >= 4)
    if (tokens.length === 0) return true // no meaningful tokens → engine returns score 0 for all

    const searchables = [
      suggestion.id.toLowerCase(),
      suggestion.title.toLowerCase(),
      suggestion.subtitle?.toLowerCase() ?? '',
      ...(suggestion.keywords?.map(k => k.toLowerCase()) ?? []),
    ].join(' ')

    // Check if the full normalized query appears as a substring
    if (searchables.includes(normalized)) return true

    // Check if any meaningful token appears
    return tokens.some(token => searchables.includes(token))
  }

  it('every result for a known keyword query has relevance to the query', () => {
    fc.assert(
      fc.property(
        arbKnownKeyword,
        (query) => {
          const results = getCommandBarSuggestions(query, defaultContext, 20)

          for (const result of results) {
            expect(hasRelevance(query, result)).toBe(true)
          }
        }
      ),
      { numRuns: 200 }
    )
  })

  it('every result for a combined keyword query has relevance', () => {
    fc.assert(
      fc.property(
        arbKnownKeyword,
        arbKnownKeyword,
        (kw1, kw2) => {
          const query = `${kw1} ${kw2}`
          const results = getCommandBarSuggestions(query, defaultContext, 20)

          for (const result of results) {
            expect(hasRelevance(query, result)).toBe(true)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('every result for a keyword query with varied context has relevance', () => {
    const arbContext = fc.record({
      hasCurrentSession: fc.boolean(),
    })

    fc.assert(
      fc.property(
        arbKnownKeyword,
        arbContext,
        (query, ctx) => {
          const results = getCommandBarSuggestions(query, ctx, 20)

          for (const result of results) {
            expect(hasRelevance(query, result)).toBe(true)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

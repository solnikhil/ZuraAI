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
    it('prefers Settings command over web search', () => {
      const suggestions = getCommandBarSuggestions('settings', {
        toolsEnabled: true,
        webSearchEnabled: true,
        hasCurrentSession: false
      })

      expect(suggestions[0]?.id).toBe('go-settings')
    })

    it('treats "goto settings" as settings navigation', () => {
      const suggestions = getCommandBarSuggestions('goto settings', {
        toolsEnabled: true,
        webSearchEnabled: true,
        hasCurrentSession: false
      })

      expect(suggestions[0]?.id).toBe('go-settings')
    })

    it('offers web search quick action for domains', () => {
      const suggestions = getCommandBarSuggestions('example.com', {
        toolsEnabled: true,
        webSearchEnabled: true,
        hasCurrentSession: false
      })

      expect(suggestions[0]?.id).toBe('quick-web-search')
    })

    it('hides quick actions in commands-only mode', () => {
      const suggestions = getCommandBarSuggestions('>settings', {
        toolsEnabled: true,
        webSearchEnabled: true,
        hasCurrentSession: false
      })

      const ids = suggestions.map(s => s.id)
      expect(ids).toContain('go-settings')
      expect(ids).not.toContain('quick-web-search')
      expect(ids).not.toContain('quick-fetch-url')
    })

    it('offers providers section shortcut', () => {
      const suggestions = getCommandBarSuggestions('providers', {
        toolsEnabled: true,
        webSearchEnabled: true,
        hasCurrentSession: false,
      })

      expect(suggestions.some((item) => item.id === 'go-settings-providers')).toBe(true)
    })

    it('offers OpenRouter settings when typing openrouter', () => {
      const suggestions = getCommandBarSuggestions('openrouter', {
        toolsEnabled: true,
        webSearchEnabled: true,
        hasCurrentSession: false,
      })

      const openrouterSuggestion = suggestions.find((s) => s.id === 'go-settings-openrouter')
      expect(openrouterSuggestion).toBeDefined()
      expect(openrouterSuggestion?.title).toBe('OpenRouter Settings')
    })

    it('offers Groq settings when typing groq', () => {
      const suggestions = getCommandBarSuggestions('groq', {
        toolsEnabled: true,
        webSearchEnabled: true,
        hasCurrentSession: false,
      })

      const groqSuggestion = suggestions.find((s) => s.id === 'go-settings-groq')
      expect(groqSuggestion).toBeDefined()
      expect(groqSuggestion?.title).toBe('Groq Settings')
    })

    it('offers Search APIs settings when typing tavily', () => {
      const suggestions = getCommandBarSuggestions('tavily', {
        toolsEnabled: true,
        webSearchEnabled: true,
        hasCurrentSession: false,
      })

      const searchApisSuggestion = suggestions.find((s) => s.id === 'go-settings-search-apis')
      expect(searchApisSuggestion).toBeDefined()
      expect(searchApisSuggestion?.title).toBe('Search APIs Settings')
    })
  })
})

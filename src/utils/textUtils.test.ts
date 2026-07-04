/**
 * Unit tests for textUtils
 * Tests centralized text processing utility functions
 */

import { describe, it, expect } from 'vitest'
import { removeEmojis } from './textUtils'

describe('textUtils', () => {
  describe('removeEmojis', () => {
    it('removes emoticons', () => {
      expect(removeEmojis('Hello 😀 World')).toBe('Hello  World')
      expect(removeEmojis('Test 😊😎🤔')).toBe('Test')
    })

    it('removes miscellaneous symbols', () => {
      expect(removeEmojis('Weather ☀️🌧️')).toBe('Weather')
    })

    it('removes transport symbols', () => {
      expect(removeEmojis('Travel 🚗✈️🚀')).toBe('Travel')
    })

    it('removes flags', () => {
      expect(removeEmojis('USA 🇺🇸 UK 🇬🇧')).toBe('USA  UK')
    })

    it('preserves regular text', () => {
      expect(removeEmojis('Hello World')).toBe('Hello World')
      expect(removeEmojis('Test 123')).toBe('Test 123')
    })

    it('handles empty string', () => {
      expect(removeEmojis('')).toBe('')
    })

    it('handles null/undefined gracefully', () => {
      expect(removeEmojis(null as any)).toBe('')
      expect(removeEmojis(undefined as any)).toBe('')
    })

    it('trims whitespace', () => {
      expect(removeEmojis('  Hello 😀  ')).toBe('Hello')
    })
  })
})

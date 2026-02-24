/**
 * Unit tests for textUtils
 * Tests centralized text processing utility functions
 * 
 * Requirements: 4.2
 */

import { describe, it, expect } from 'vitest'
import {
  removeEmojis,
  truncateText,
  sanitizeDisplayText,
  capitalizeFirst,
  toTitleCase,
  extractModelName,
  formatNumber,
  formatBytes
} from './textUtils'

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

  describe('truncateText', () => {
    it('returns original text if shorter than maxLength', () => {
      expect(truncateText('Hello', 10)).toBe('Hello')
    })

    it('truncates text with ellipsis', () => {
      const result = truncateText('Hello World', 8)
      expect(result.length).toBeLessThanOrEqual(8)
      expect(result).toContain('...')
    })

    it('respects word boundaries when possible', () => {
      // With maxLength 15 and ellipsis '...', we have 12 chars for content
      // 'Hello beauti' is 12 chars, last space at index 5 is at 41% (not > 80%)
      // So it won't cut at word boundary, it will just truncate
      const result = truncateText('Hello beautiful world', 15)
      expect(result).toBe('Hello beauti...')
      expect(result.length).toBeLessThanOrEqual(15)
    })

    it('handles empty string', () => {
      expect(truncateText('', 10)).toBe('')
    })

    it('handles null/undefined gracefully', () => {
      expect(truncateText(null as any, 10)).toBe('')
      expect(truncateText(undefined as any, 10)).toBe('')
    })

    it('uses custom ellipsis', () => {
      const result = truncateText('Hello World', 8, '…')
      expect(result).toContain('…')
    })

    it('handles maxLength shorter than ellipsis', () => {
      expect(truncateText('Hello World', 2)).toBe('..')
      expect(truncateText('Hello World', 1)).toBe('.')
    })

    it('handles non-positive maxLength', () => {
      expect(truncateText('Hello World', 0)).toBe('')
      expect(truncateText('Hello World', -5)).toBe('')
    })

    it('handles non-finite maxLength', () => {
      expect(truncateText('Hello World', Number.NaN)).toBe('')
      expect(truncateText('Hello World', Number.POSITIVE_INFINITY)).toBe('Hello World')
      expect(truncateText('Hello World', Number.NEGATIVE_INFINITY)).toBe('')
    })
  })

  describe('sanitizeDisplayText', () => {
    it('removes control characters', () => {
      expect(sanitizeDisplayText('Hello\x00World')).toBe('HelloWorld')
      expect(sanitizeDisplayText('Test\x1FData')).toBe('TestData')
    })

    it('preserves newlines and tabs', () => {
      expect(sanitizeDisplayText('Hello\nWorld')).toBe('Hello\nWorld')
      expect(sanitizeDisplayText('Hello\tWorld')).toBe('Hello\tWorld')
    })

    it('normalizes multiple spaces', () => {
      expect(sanitizeDisplayText('Hello    World')).toBe('Hello World')
    })

    it('normalizes multiple newlines', () => {
      expect(sanitizeDisplayText('Hello\n\n\n\nWorld')).toBe('Hello\n\nWorld')
    })

    it('trims whitespace', () => {
      expect(sanitizeDisplayText('  Hello World  ')).toBe('Hello World')
    })

    it('handles empty string', () => {
      expect(sanitizeDisplayText('')).toBe('')
    })

    it('handles null/undefined gracefully', () => {
      expect(sanitizeDisplayText(null as any)).toBe('')
      expect(sanitizeDisplayText(undefined as any)).toBe('')
    })
  })

  describe('capitalizeFirst', () => {
    it('capitalizes first letter', () => {
      expect(capitalizeFirst('hello')).toBe('Hello')
      expect(capitalizeFirst('world')).toBe('World')
    })

    it('preserves rest of string', () => {
      expect(capitalizeFirst('hELLO')).toBe('HELLO')
    })

    it('handles single character', () => {
      expect(capitalizeFirst('a')).toBe('A')
    })

    it('handles empty string', () => {
      expect(capitalizeFirst('')).toBe('')
    })

    it('handles null/undefined gracefully', () => {
      expect(capitalizeFirst(null as any)).toBe('')
      expect(capitalizeFirst(undefined as any)).toBe('')
    })
  })

  describe('toTitleCase', () => {
    it('converts to title case', () => {
      expect(toTitleCase('hello world')).toBe('Hello World')
      expect(toTitleCase('HELLO WORLD')).toBe('Hello World')
    })

    it('handles single word', () => {
      expect(toTitleCase('hello')).toBe('Hello')
    })

    it('handles empty string', () => {
      expect(toTitleCase('')).toBe('')
    })

    it('handles null/undefined gracefully', () => {
      expect(toTitleCase(null as any)).toBe('')
      expect(toTitleCase(undefined as any)).toBe('')
    })
  })

  describe('extractModelName', () => {
    it('extracts model name from path', () => {
      expect(extractModelName('openai/gpt-4-turbo')).toBe('gpt-4-turbo')
      expect(extractModelName('anthropic/claude-3-opus')).toBe('claude-3-opus')
    })

    it('handles multiple slashes', () => {
      expect(extractModelName('org/repo/model-name')).toBe('model-name')
    })

    it('returns original if no slash', () => {
      expect(extractModelName('gpt-4')).toBe('gpt-4')
    })

    it('handles empty string', () => {
      expect(extractModelName('')).toBe('')
    })

    it('handles null/undefined gracefully', () => {
      expect(extractModelName(null as any)).toBe('')
      expect(extractModelName(undefined as any)).toBe('')
    })
  })

  describe('formatNumber', () => {
    it('formats numbers with thousand separators', () => {
      expect(formatNumber(1000)).toBe('1,000')
      expect(formatNumber(1000000)).toBe('1,000,000')
    })

    it('handles small numbers', () => {
      expect(formatNumber(100)).toBe('100')
      expect(formatNumber(0)).toBe('0')
    })

    it('handles negative numbers', () => {
      expect(formatNumber(-1000)).toBe('-1,000')
    })

    it('handles decimals', () => {
      expect(formatNumber(1234.56)).toBe('1,234.56')
    })
  })

  describe('formatBytes', () => {
    it('formats bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 Bytes')
      expect(formatBytes(1024)).toBe('1 KB')
      expect(formatBytes(1048576)).toBe('1 MB')
      expect(formatBytes(1073741824)).toBe('1 GB')
    })

    it('handles decimal precision', () => {
      expect(formatBytes(1536, 1)).toBe('1.5 KB')
      expect(formatBytes(1536, 0)).toBe('2 KB')
    })

    it('handles large values', () => {
      expect(formatBytes(1099511627776)).toBe('1 TB')
    })

    it('handles invalid and negative byte values', () => {
      expect(formatBytes(-1)).toBe('0 Bytes')
      expect(formatBytes(Number.NaN)).toBe('0 Bytes')
      expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('0 Bytes')
    })

    it('clamps very large units to TB label', () => {
      expect(formatBytes(1152921504606847000)).toContain('TB')
    })
  })
})

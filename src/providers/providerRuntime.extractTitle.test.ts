import { describe, it, expect } from 'vitest'
import { extractTitleTextFromMessage } from './providerRuntime'

describe('extractTitleTextFromMessage', () => {
  it('prefers content when present', () => {
    expect(
      extractTitleTextFromMessage({ content: '{"facts":[],"summary":""}' })
    ).toBe('{"facts":[],"summary":""}')
  })

  it('joins array content parts', () => {
    expect(
      extractTitleTextFromMessage({
        content: [{ text: '{"facts":' }, { text: '[]}' }],
      })
    ).toBe('{"facts":[]}')
  })

  it('falls back to reasoning_content when content is empty (reasoner safety net)', () => {
    expect(
      extractTitleTextFromMessage({
        content: '',
        reasoning_content: '{"facts":["likes dark mode"],"summary":""}',
      })
    ).toBe('{"facts":["likes dark mode"],"summary":""}')
  })

  it('falls back to reasoning_content when content is null', () => {
    expect(
      extractTitleTextFromMessage({
        content: null,
        reasoning_content: 'recovered text',
      })
    ).toBe('recovered text')
  })

  it('does NOT use reasoning_content when content has a real answer', () => {
    expect(
      extractTitleTextFromMessage({
        content: 'real answer',
        reasoning_content: 'internal thoughts that should be ignored',
      })
    ).toBe('real answer')
  })

  it('returns empty string when neither field is usable', () => {
    expect(extractTitleTextFromMessage({ content: '', reasoning_content: '   ' })).toBe('')
    expect(extractTitleTextFromMessage(null)).toBe('')
    expect(extractTitleTextFromMessage(undefined)).toBe('')
  })
})

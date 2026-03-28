import { describe, expect, it } from 'vitest'
import { isSafeHttpUrl, normalizeSafeHttpUrl } from './urlSafety'

describe('urlSafety', () => {
  it('accepts http and https URLs', () => {
    expect(normalizeSafeHttpUrl('https://example.com/path?q=1')).toBe(
      'https://example.com/path?q=1'
    )
    expect(isSafeHttpUrl('http://example.com')).toBe(true)
  })

  it('rejects unsafe or invalid URLs', () => {
    expect(normalizeSafeHttpUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeSafeHttpUrl('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(normalizeSafeHttpUrl('not a url')).toBeNull()
    expect(isSafeHttpUrl('file:///C:/temp/test.txt')).toBe(false)
  })
})

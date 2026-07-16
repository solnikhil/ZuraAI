import { describe, expect, it } from 'vitest'
import { resolveAppSurface } from './appSurface'

describe('resolveAppSurface', () => {
  it('selects exact utility routes while allowing query parameters', () => {
    expect(resolveAppSurface('#/about', true)).toBe('about')
    expect(resolveAppSurface('#/about?source=menu', true)).toBe('about')
    expect(resolveAppSurface('#/chat-debug?sessionId=session-1', true)).toBe('chat-debug')
  })

  it('does not treat route-prefix lookalikes as utility windows', () => {
    expect(resolveAppSurface('#/about-anything', true)).toBe('dashboard')
    expect(resolveAppSurface('#/about/nested', true)).toBe('dashboard')
    expect(resolveAppSurface('#/chat-debug-extra', true)).toBe('dashboard')
  })

  it('keeps the development-only chat debug surface unavailable in production', () => {
    expect(resolveAppSurface('#/chat-debug?sessionId=session-1', false)).toBe('dashboard')
  })
})

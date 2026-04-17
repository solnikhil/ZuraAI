import { describe, expect, it } from 'vitest'

import { getCommandBarSuggestions, normalizeCommandQuery } from './suggestions'

describe('overlay command suggestions', () => {
  it('surfaces the overlay toggle command', () => {
    const suggestions = getCommandBarSuggestions('overlay', { hasCurrentSession: false }, 20)

    expect(suggestions.some((suggestion) => suggestion.action.type === 'toggle_overlay')).toBe(
      true
    )
  })

  it('normalizes overlay queries into the overlay settings section', () => {
    expect(normalizeCommandQuery('open overlay')).toBe('overlay')
  })
})
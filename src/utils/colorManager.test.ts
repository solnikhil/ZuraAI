import { describe, expect, it, beforeEach } from 'vitest'
import { assignColor } from './colorManager'

const STORAGE_KEY = 'zura-model-colors'

describe('colorManager', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it.each(['null', '"blue"', '[]'])('ignores non-mapping localStorage values: %s', (value) => {
    localStorage.setItem(STORAGE_KEY, value)

    expect(() => assignColor('test-model')).not.toThrow()
    expect(assignColor('test-model')).toBe('hsl(217, 91%, 60%)')
  })

  it('drops invalid mapping values while preserving valid colors', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        existing: 'hsl(142, 71%, 45%)',
        bad: 42,
      })
    )

    expect(assignColor('existing')).toBe('hsl(142, 71%, 45%)')
    expect(assignColor('next')).toBe('hsl(217, 91%, 60%)')
  })
})

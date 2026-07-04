import { describe, expect, it } from 'vitest'
import { resolveStreamPhase } from './streamingContentPlacement'

describe('resolveStreamPhase', () => {
  it('coerces reasoning, tool, and searching to answering once answer content exists', () => {
    expect(resolveStreamPhase('reasoning', true)).toBe('answering')
    expect(resolveStreamPhase('tool', true)).toBe('answering')
    expect(resolveStreamPhase('searching', true)).toBe('answering')
    expect(resolveStreamPhase('answering', true)).toBe('answering')
  })

  it('preserves the requested phase before visible answer content exists', () => {
    expect(resolveStreamPhase('reasoning', false)).toBe('reasoning')
    expect(resolveStreamPhase('tool', false)).toBe('tool')
    expect(resolveStreamPhase('searching', false)).toBe('searching')
    expect(resolveStreamPhase('answering', false)).toBe('answering')
  })
})

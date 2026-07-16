// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import { DisposableRegistry } from './disposableRegistry'

describe('DisposableRegistry', () => {
  it('disposes registrations once in reverse order', () => {
    const calls: number[] = []
    const registry = new DisposableRegistry()
    registry.add(() => calls.push(1))
    registry.add(() => calls.push(2))
    registry.dispose()
    registry.dispose()
    expect(calls).toEqual([2, 1])
  })

  it('continues disposal when one registration throws', () => {
    const final = vi.fn()
    const registry = new DisposableRegistry()
    registry.add(final)
    registry.add(() => {
      throw new Error('cleanup failed')
    })
    expect(() => registry.dispose()).toThrow(AggregateError)
    expect(final).toHaveBeenCalledOnce()
  })
})

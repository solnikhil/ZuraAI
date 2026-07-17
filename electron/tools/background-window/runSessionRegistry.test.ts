import { describe, expect, it, vi } from 'vitest'
import { BackgroundWindowRunSessionRegistry } from './runSessionRegistry'

const target = { hwnd: 101, pid: 202, processStartTime: 303 }

describe('BackgroundWindowRunSessionRegistry', () => {
  it('enforces one sender-bound target per run', () => {
    const registry = new BackgroundWindowRunSessionRegistry()
    expect(registry.register('run-1', 7, target)).toMatchObject({ ok: true, created: true })
    expect(registry.register('run-1', 7, target)).toMatchObject({ ok: true, created: false })
    expect(registry.register('run-1', 7, { ...target, hwnd: 102 })).toEqual({
      ok: false,
      reason: 'run-already-has-target',
    })
    expect(registry.register('run-1', 8, target)).toEqual({
      ok: false,
      reason: 'run-owned-by-another-renderer',
    })
    expect(registry.get('run-1', 8)).toBeNull()
  })

  it('returns defensive target copies', () => {
    const registry = new BackgroundWindowRunSessionRegistry()
    registry.register('run-1', 7, target)
    registry.get('run-1', 7)!.target.hwnd = 999
    expect(registry.get('run-1', 7)?.target.hwnd).toBe(101)
  })

  it('releases all sessions for a destroyed sender', async () => {
    const onRelease = vi.fn()
    const registry = new BackgroundWindowRunSessionRegistry({ onRelease })
    registry.register('run-1', 7, target)
    registry.register('run-2', 7, { ...target, hwnd: 102 })
    registry.register('run-3', 8, { ...target, hwnd: 103 })

    await expect(registry.releaseSender(7)).resolves.toBe(2)
    expect(registry.get('run-1', 7)).toBeNull()
    expect(registry.get('run-3', 8)).not.toBeNull()
    expect(onRelease).toHaveBeenCalledTimes(2)
  })

  it('disposes remaining sessions and rejects incomplete identity', async () => {
    const onRelease = vi.fn()
    const registry = new BackgroundWindowRunSessionRegistry({ onRelease })
    expect(() => registry.register('run-1', 7, { ...target, processStartTime: 0 })).toThrow()
    registry.register('run-1', 7, target)
    await registry.dispose()
    expect(registry.get('run-1', 7)).toBeNull()
    expect(onRelease).toHaveBeenCalledWith(expect.any(Object), 'shutdown')
  })
})

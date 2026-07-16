import { describe, expect, it, vi } from 'vitest'

import { ChatRunController, type ChatRunPhase } from './chatRunController'
import { finalizeChatRun } from './chatRunFinalization'

describe('ChatRunController', () => {
  it('finalizes completion exactly once', () => {
    const finalizer = vi.fn()
    const run = new ChatRunController('send', { id: 'run-1', startedAt: 1 })
    run.transition('streaming')

    expect(run.complete(finalizer)).toBe(true)
    expect(run.complete(finalizer)).toBe(false)
    expect(run.fail(finalizer)).toBe(false)
    expect(run.phase).toBe('completed')
    expect(run.snapshot.outcome).toBe('completed')
    expect(finalizer).toHaveBeenCalledOnce()
  })

  it.each<ChatRunPhase>(['preparing', 'streaming', 'awaiting_tool', 'executing_tools'])(
    'cancels from %s, aborts provider work, and finalizes once',
    (phase) => {
      const finalizer = vi.fn()
      const run = new ChatRunController('regenerate')
      if (phase !== 'preparing') {
        run.transition('streaming')
        if (phase === 'awaiting_tool') run.transition('awaiting_tool')
        if (phase === 'executing_tools') run.transition('executing_tools')
      }

      expect(run.cancel(finalizer)).toBe(true)
      expect(run.signal.aborted).toBe(true)
      expect(run.phase).toBe('cancelled')
      expect(run.cancel(finalizer)).toBe(false)
      expect(run.complete(finalizer)).toBe(false)
      expect(finalizer).toHaveBeenCalledOnce()
    }
  )

  it('rejects invalid lifecycle transitions', () => {
    const run = new ChatRunController('send')
    expect(() => run.transition('executing_tools')).toThrow(
      'Invalid chat run transition: preparing -> executing_tools'
    )
  })

  it('runs shared cleanup exactly once even when finalization throws', () => {
    const cleanup = vi.fn()
    const run = new ChatRunController('send')
    run.transition('streaming')

    expect(() =>
      finalizeChatRun(
        run,
        'completed',
        () => {
          throw new Error('commit failed')
        },
        cleanup
      )
    ).toThrow('commit failed')
    expect(cleanup).toHaveBeenCalledOnce()
    expect(run.phase).toBe('failed')
    expect(finalizeChatRun(run, 'failed', vi.fn(), cleanup)).toBe(false)
    expect(cleanup).toHaveBeenCalledOnce()
  })
})

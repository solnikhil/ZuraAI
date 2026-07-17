import { describe, expect, it, vi } from 'vitest'

import { BackgroundWindowCoordinator } from './coordinator'
import { BackgroundWindowRunSessionRegistry } from './runSessionRegistry'
import type {
  BackgroundWindowSessionCallbacks,
  BackgroundWindowSessionRequest,
} from './sessionManager'

const owner = { runId: 'run-1', senderWebContentsId: 7 }
const target = {
  hwnd: 42,
  processId: 123,
  processStartTimeMs: 456,
  title: 'Notepad',
}

function createHarness() {
  let callbacks: BackgroundWindowSessionCallbacks = {}
  let active: { request: BackgroundWindowSessionRequest; target: typeof target } | null = null
  const manager = {
    reserve: vi.fn(async (request: BackgroundWindowSessionRequest, nextCallbacks = {}) => {
      callbacks = nextCallbacks
      active = { request, target }
      return target
    }),
    owns: vi.fn(
      (runId: string, senderWebContentsId: number) =>
        active?.request.runId === runId &&
        active.request.senderWebContentsId === senderWebContentsId
    ),
    getTarget: vi.fn(() => (active ? target : null)),
    getSession: vi.fn(() => active),
    release: vi.fn((reason = 'released') => {
      if (!active) return
      active = null
      callbacks.onRelease?.(reason as never)
    }),
  }
  const registry = new BackgroundWindowRunSessionRegistry()
  const coordinator = new BackgroundWindowCoordinator({
    manager: manager as never,
    registry,
  })
  return {
    coordinator,
    manager,
    registry,
    emitRelease: (reason: string) => callbacks.onRelease?.(reason as never),
  }
}

describe('BackgroundWindowCoordinator', () => {
  it('binds the resolved target identity to the owning renderer and run', async () => {
    const { coordinator, registry } = createHarness()
    await coordinator.attach(owner, target.hwnd, vi.fn())

    expect(coordinator.status(owner)).toEqual(target)
    expect(registry.get(owner.runId, owner.senderWebContentsId)?.target).toEqual({
      hwnd: target.hwnd,
      pid: target.processId,
      processStartTime: target.processStartTimeMs,
    })
    expect(coordinator.status({ ...owner, senderWebContentsId: 8 })).toBeNull()
  })

  it('notifies only typed stop reasons and releases ownership', async () => {
    const { coordinator, registry, emitRelease } = createHarness()
    const notify = vi.fn()
    await coordinator.attach(owner, target.hwnd, notify)

    emitRelease('target-lost')
    await vi.waitFor(() => expect(registry.get(owner.runId, owner.senderWebContentsId)).toBeNull())
    expect(notify).toHaveBeenCalledWith({ runId: owner.runId, reason: 'target-lost' })
  })

  it('releases the guard and registry on chat-run completion', async () => {
    const { coordinator, manager, registry } = createHarness()
    await coordinator.attach(owner, target.hwnd, vi.fn())

    await expect(coordinator.release(owner, 'run-finished')).resolves.toBe(true)
    expect(manager.release).toHaveBeenCalledWith('released')
    expect(registry.get(owner.runId, owner.senderWebContentsId)).toBeNull()
  })
})

// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChatDiagnosticEvent } from './chatDiagnostics'
import { CHAT_DIAGNOSTICS_BUFFER_LIMIT, useChatDiagnosticsStream } from './useChatDiagnosticsStream'

interface ChatDiagnosticsBridgeStub {
  listEvents: ReturnType<typeof vi.fn>
  onEvent: ReturnType<typeof vi.fn>
}

let listeners: Array<(event: ChatDiagnosticEvent) => void> = []

function makeEvent(
  sessionId: string,
  messageId: string,
  phase: ChatDiagnosticEvent['phase']
): ChatDiagnosticEvent {
  return {
    sessionId,
    messageId,
    phase,
    timestamp: Date.now(),
  }
}

function installBridge(initial: ChatDiagnosticEvent[]): ChatDiagnosticsBridgeStub {
  const bridge: ChatDiagnosticsBridgeStub = {
    listEvents: vi.fn(async () => initial),
    onEvent: vi.fn((callback: (event: ChatDiagnosticEvent) => void) => {
      listeners.push(callback)
      return () => {
        listeners = listeners.filter((listener) => listener !== callback)
      }
    }),
  }
  ;(window as unknown as { chatDiagnostics: ChatDiagnosticsBridgeStub }).chatDiagnostics = bridge
  return bridge
}

function emit(event: ChatDiagnosticEvent): void {
  for (const listener of listeners) {
    listener(event)
  }
}

beforeEach(() => {
  listeners = []
})

afterEach(() => {
  delete (window as unknown as { chatDiagnostics?: unknown }).chatDiagnostics
})

describe('useChatDiagnosticsStream', () => {
  it('reports unavailable and returns no events when the bridge is missing', () => {
    const { result } = renderHook(() => useChatDiagnosticsStream('session-x'))
    expect(result.current.isAvailable).toBe(false)
    expect(result.current.events).toEqual([])
    expect(typeof result.current.clear).toBe('function')
    // clear is a no-op but should not throw
    act(() => result.current.clear())
    expect(result.current.events).toEqual([])
  })

  it('hydrates with persisted history on mount', async () => {
    const history = [
      makeEvent('session-1', 'm1', 'request-start'),
      makeEvent('session-1', 'm2', 'finish'),
    ]
    const bridge = installBridge(history)

    const { result } = renderHook(() => useChatDiagnosticsStream('session-1'))

    await waitFor(() => expect(result.current.events).toHaveLength(2))
    expect(bridge.listEvents).toHaveBeenCalledWith('session-1')
    expect(result.current.events.map((event) => event.messageId)).toEqual(['m1', 'm2'])
    expect(result.current.isAvailable).toBe(true)
  })

  it('appends live events for the active session', async () => {
    installBridge([])

    const { result } = renderHook(() => useChatDiagnosticsStream('session-live'))

    await waitFor(() => expect(result.current.events).toEqual([]))
    act(() => emit(makeEvent('session-live', 'm1', 'tool-start')))
    expect(result.current.events).toHaveLength(1)
    expect(result.current.events[0].messageId).toBe('m1')
  })

  it('ignores live events for a different session', async () => {
    installBridge([])

    const { result } = renderHook(() => useChatDiagnosticsStream('session-a'))

    await waitFor(() => expect(result.current.events).toEqual([]))
    act(() => emit(makeEvent('session-b', 'm1', 'finish')))
    expect(result.current.events).toEqual([])
  })

  it('caps the in-memory buffer with FIFO drop on overflow', async () => {
    installBridge([])

    const { result } = renderHook(() => useChatDiagnosticsStream('session-cap'))

    await waitFor(() => expect(result.current.events).toEqual([]))

    act(() => {
      for (let index = 0; index < CHAT_DIAGNOSTICS_BUFFER_LIMIT + 25; index += 1) {
        emit(makeEvent('session-cap', `m-${index}`, 'finish'))
      }
    })

    expect(result.current.events).toHaveLength(CHAT_DIAGNOSTICS_BUFFER_LIMIT)
    // Oldest 25 should be dropped.
    expect(result.current.events[0].messageId).toBe('m-25')
    expect(result.current.events.at(-1)?.messageId).toBe(
      `m-${CHAT_DIAGNOSTICS_BUFFER_LIMIT + 25 - 1}`
    )
  })

  it('clears the buffer on demand', async () => {
    installBridge([makeEvent('s1', 'm1', 'finish')])

    const { result } = renderHook(() => useChatDiagnosticsStream('s1'))

    await waitFor(() => expect(result.current.events).toHaveLength(1))
    act(() => result.current.clear())
    expect(result.current.events).toEqual([])
  })

  it('reloads when sessionId changes', async () => {
    const eventsBySession: Record<string, ChatDiagnosticEvent[]> = {
      a: [makeEvent('a', 'm1', 'finish')],
      b: [makeEvent('b', 'b1', 'finish'), makeEvent('b', 'b2', 'tool-start')],
    }
    const bridge: ChatDiagnosticsBridgeStub = {
      listEvents: vi.fn(async (id: string) => eventsBySession[id] ?? []),
      onEvent: vi.fn((callback: (event: ChatDiagnosticEvent) => void) => {
        listeners.push(callback)
        return () => {
          listeners = listeners.filter((listener) => listener !== callback)
        }
      }),
    }
    ;(window as unknown as { chatDiagnostics: ChatDiagnosticsBridgeStub }).chatDiagnostics = bridge

    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useChatDiagnosticsStream(id),
      { initialProps: { id: 'a' } }
    )
    await waitFor(() => expect(result.current.events).toHaveLength(1))

    rerender({ id: 'b' })
    await waitFor(() => expect(result.current.events).toHaveLength(2))
    expect(result.current.events.map((event) => event.messageId)).toEqual(['b1', 'b2'])
  })
})

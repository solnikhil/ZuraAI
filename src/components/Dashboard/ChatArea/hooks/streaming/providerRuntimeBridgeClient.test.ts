import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProviderRuntimeBridgeEvent, ProviderRuntimeAPI } from '../../../../../electron/types'
import { streamProviderEventsThroughMain } from './providerRuntimeBridgeClient'

describe('providerRuntimeBridgeClient', () => {
  let listener: ((event: ProviderRuntimeBridgeEvent) => void) | undefined
  let api: ProviderRuntimeAPI

  beforeEach(() => {
    listener = undefined
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '00000000-0000-4000-8000-000000000001'
    )
    api = {
      start: vi.fn(async (request) => {
        queueMicrotask(() => {
          listener?.({
            requestId: request.requestId,
            type: 'event',
            event: { type: 'text-delta', delta: 'hello' },
          })
          listener?.({ requestId: request.requestId, type: 'done' })
        })
        return true
      }),
      cancel: vi.fn().mockResolvedValue(true),
      onEvent: vi.fn((callback) => {
        listener = callback
        return () => {
          listener = undefined
        }
      }),
    }
    window.providerRuntime = api
  })

  it('collects main-process stream events without sending provider secrets', async () => {
    const events = []
    for await (const event of streamProviderEventsThroughMain({
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: 'hello' }],
      temperature: 0.2,
      maxTokens: 64,
      streamResponses: true,
    })) {
      events.push(event)
    }

    expect(events).toEqual([{ type: 'text-delta', delta: 'hello' }])
    const request = vi.mocked(api.start).mock.calls[0]?.[0]
    expect(request).not.toHaveProperty('groqApiKey')
    expect(request).not.toHaveProperty('openRouterApiKey')
    expect(api.cancel).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001')
  })

  it('propagates cancellation to main', async () => {
    vi.mocked(api.start).mockImplementation(async () => true)
    const controller = new AbortController()
    const stream = streamProviderEventsThroughMain(
      {
        provider: 'groq',
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: 'hello' }],
      },
      controller.signal
    )
    const pending = stream.next()
    await vi.waitFor(() => expect(api.start).toHaveBeenCalled())
    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(api.cancel).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001')
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../secureStorage', () => ({
  getSecureValueAsync: vi.fn(async () => 'test-api-key'),
}))

import { executeCode } from './service'

describe('code execution Agent cancellation', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('aborts the remote request when the owning Agent run is cancelled', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          if (init?.signal?.aborted) {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
            return
          }
          init?.signal?.addEventListener(
            'abort',
            () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
            { once: true }
          )
        })
      })
    )
    const controller = new AbortController()
    const execution = executeCode(
      { code: 'print(1)', language: 'python', autoApprove: true },
      { senderWebContentsId: 7, runId: 'run-code', signal: controller.signal }
    )

    controller.abort('user-stop')

    await expect(execution).resolves.toEqual({
      success: false,
      error: 'Code execution cancelled with the Agent run.',
    })
  })

  it('does not dispatch a remote request for an already-cancelled run', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const controller = new AbortController()
    controller.abort('cancel-before-tool')

    await expect(
      executeCode(
        { code: 'print(1)', language: 'python', autoApprove: true },
        { senderWebContentsId: 7, runId: 'run-code', signal: controller.signal }
      )
    ).resolves.toEqual({
      success: false,
      error: 'Code execution cancelled with the Agent run.',
    })
    expect(fetch).not.toHaveBeenCalled()
  })
})

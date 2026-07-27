import { beforeEach, describe, expect, it, vi } from 'vitest'

import { executeTool } from './executor'

const testWindow = window as Window &
  typeof globalThis & {
    ipcRenderer: { invoke: ReturnType<typeof vi.fn> }
  }

describe('executeTool web_search argument normalization', () => {
  beforeEach(() => {
    testWindow.ipcRenderer = {
      invoke: vi.fn(async () => ({
        success: true,
        data: { ok: true },
      })),
    } as any
    localStorage.clear()
  })

  it('preserves user-requested historical years when context is provided', async () => {
    await executeTool(
      'web_search',
      { query: 'Claude code leak Anthropic 2024 2025' },
      { userContextText: 'compare the 2024 and 2025 Claude incidents' }
    )

    expect(testWindow.ipcRenderer.invoke).toHaveBeenCalledWith('execute-tool', 'web_search', {
      query: 'Claude code leak Anthropic 2024 2025',
      search_depth: 'fast',
      include_images: true,
    })
  })

  it('rejects unknown built-in names before IPC', async () => {
    await expect(executeTool('file_not_registered', {})).resolves.toMatchObject({
      success: false,
      error: 'Tool "file_not_registered" is disabled.',
    })
    expect(testWindow.ipcRenderer.invoke).not.toHaveBeenCalled()
  })

  it('keeps approval authorization in a separate execution context', async () => {
    await executeTool(
      'system_shell',
      { command: 'Get-Date', description: 'Check the current date' },
      { approvalToken: 'main-issued-token' }
    )

    expect(testWindow.ipcRenderer.invoke).toHaveBeenCalledWith(
      'execute-tool',
      'system_shell',
      { command: 'Get-Date', description: 'Check the current date' },
      { approvalToken: 'main-issued-token', runId: undefined, agentSkills: undefined }
    )
  })

  it('keeps the opaque chat run id out of model-visible arguments', async () => {
    const args = { path: 'C:\\demo.txt' }
    await executeTool('file_read', args, { runId: '9c04fb04-4d47-40cb-91b7-cdb05813866f' })

    expect(testWindow.ipcRenderer.invoke).toHaveBeenCalledWith('execute-tool', 'file_read', args, {
      approvalToken: undefined,
      runId: '9c04fb04-4d47-40cb-91b7-cdb05813866f',
      agentSkills: undefined,
    })
    expect(args).not.toHaveProperty('runId')
  })

  it('cancels the authoritative Agent run when renderer tool timeout wins', async () => {
    vi.useFakeTimers()
    const cancel = vi.fn(async () => true)
    testWindow.agentRun = { cancel, getRuntime: vi.fn(async () => null) }
    testWindow.ipcRenderer.invoke = vi.fn(() => new Promise(() => undefined))

    try {
      const execution = executeTool('file_read', { path: 'C:\\slow.txt' }, { runId: 'run-timeout' })
      await vi.advanceTimersByTimeAsync(30_000)

      await expect(execution).resolves.toMatchObject({
        success: false,
        error: 'Tool "file_read" took too long to execute. Please try again.',
      })
      expect(cancel).toHaveBeenCalledWith('run-timeout')
    } finally {
      vi.useRealTimers()
      delete (testWindow as Partial<Window>).agentRun
    }
  })
})

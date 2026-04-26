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
})

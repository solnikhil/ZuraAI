import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  fetchDeepSeekBalance,
  fetchDeepSeekModels,
  generateDeepSeekCompletion,
  getCanonicalDeepSeekModelId,
  isDeepSeekCompatibilityAlias,
  mapDeepSeekModelToConfiguredModel,
} from './deepseek'

describe('deepseek service helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('maps documented v4 models to current display metadata', () => {
    expect(
      mapDeepSeekModelToConfiguredModel({
        id: 'deepseek-v4-flash',
        object: 'model',
        owned_by: 'deepseek',
      })
    ).toEqual(
      expect.objectContaining({
        code: 'deepseek-v4-flash',
        displayName: 'DeepSeek V4 Flash',
        supportsToolCall: true,
        modelType: 'chat',
        maxContext: 1048576,
      })
    )

    expect(
      mapDeepSeekModelToConfiguredModel({
        id: 'deepseek-v4-pro',
        object: 'model',
        owned_by: 'deepseek',
      })
    ).toEqual(
      expect.objectContaining({
        code: 'deepseek-v4-pro',
        displayName: 'DeepSeek V4 Pro',
        supportsToolCall: true,
        supportsDeepThinking: true,
        modelType: 'reasoning',
        maxContext: 1048576,
      })
    )
  })

  it('preserves compatibility aliases while labeling them clearly', () => {
    expect(getCanonicalDeepSeekModelId('deepseek-chat')).toBe('deepseek-v4-flash')
    expect(getCanonicalDeepSeekModelId('deepseek-reasoner')).toBe('deepseek-v4-pro')
    expect(isDeepSeekCompatibilityAlias('deepseek-chat')).toBe(true)
    expect(isDeepSeekCompatibilityAlias('deepseek-v4-flash')).toBe(false)

    expect(
      mapDeepSeekModelToConfiguredModel({
        id: 'deepseek-chat',
        object: 'model',
        owned_by: 'deepseek',
      })
    ).toEqual(
      expect.objectContaining({
        code: 'deepseek-chat',
        displayName: 'DeepSeek V4 Flash (Compatibility Alias)',
        modelType: 'chat',
      })
    )
  })

  it('fetches models from /models', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        object: 'list',
        data: [{ id: 'deepseek-v4-flash', object: 'model', owned_by: 'deepseek' }],
      }),
    } as Response)

    const models = await fetchDeepSeekModels('deepseek-key')

    expect(fetchMock).toHaveBeenCalledWith('https://api.deepseek.com/models', {
      headers: {
        Authorization: 'Bearer deepseek-key',
      },
    })
    expect(models).toEqual([
      { id: 'deepseek-v4-flash', object: 'model', owned_by: 'deepseek' },
    ])
  })

  it('fetches balance from /user/balance', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        is_available: true,
        balance_infos: [{ currency: 'USD', total_balance: '10.00', granted_balance: '0.00', topped_up_balance: '10.00' }],
      }),
    } as Response)

    const balance = await fetchDeepSeekBalance('deepseek-key')

    expect(fetchMock).toHaveBeenCalledWith('https://api.deepseek.com/user/balance', {
      headers: {
        Authorization: 'Bearer deepseek-key',
      },
    })
    expect(balance).toEqual(
      expect.objectContaining({
        is_available: true,
      })
    )
  })

  it('degrades forced function tool_choice to auto for DeepSeek requests', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'chatcmpl-1',
        object: 'chat.completion',
        created: 1,
        model: 'deepseek-v4-pro',
        choices: [{ index: 0, message: { role: 'assistant', content: '' }, finish_reason: 'stop' }],
      }),
    } as Response)

    await generateDeepSeekCompletion(
      'deepseek-key',
      'deepseek-v4-pro',
      [{ role: 'user', content: 'use web search' }],
      {
        tools: [
          {
            type: 'function',
            function: {
              name: 'web_search',
              description: 'Search the web',
              parameters: {
                type: 'object',
                properties: { query: { type: 'string' } },
                required: ['query'],
              },
            },
          },
        ],
        toolChoice: { type: 'function', function: { name: 'web_search' } },
      }
    )

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body.tool_choice).toBe('auto')
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateAlibabaCompletion } from './alibaba'
import { getAlibabaBaseUrl } from './alibabaEndpoints'

describe('Alibaba service', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('uses the explicitly selected documented regional endpoint', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [], usage: {} }),
    } as Response)

    await generateAlibabaCompletion('key', 'qwen3.7-max', [{ role: 'user', content: 'hi' }], {
      baseUrl: getAlibabaBaseUrl('us-virginia'),
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://dashscope-us.aliyuncs.com/compatible-mode/v1/chat/completions',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('preserves an explicit forced tool choice', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [], usage: {} }),
    } as Response)
    const forced = { type: 'function' as const, function: { name: 'lookup' } }

    await generateAlibabaCompletion('key', 'qwen3.7-max', [{ role: 'user', content: 'hi' }], {
      tools: [{ type: 'function', function: { name: 'lookup', parameters: { type: 'object' } } }],
      toolChoice: forced,
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
    expect(body.tool_choice).toEqual(forced)
  })
})

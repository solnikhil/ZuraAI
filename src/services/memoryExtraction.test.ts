import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { parseExtractionResponse, runMemoryExtraction } from './memoryExtraction'
import { appendChatDiagnosticEvent } from '@/diagnostics/chatDiagnosticsClient'

// Mock the provider call so no network happens.
const generateTitleTextForModel = vi.fn()
vi.mock('@/providers/providerRuntime', () => ({
  generateTitleTextForModel: (...args: unknown[]) => generateTitleTextForModel(...args),
}))
vi.mock('@/diagnostics/chatDiagnosticsClient', () => ({
  appendChatDiagnosticEvent: vi.fn(),
}))

const enabledSkills = { memory: { enabled: true } } as unknown as import('@/skills').SkillsSettings
const disabledSkills = {
  memory: { enabled: false },
} as unknown as import('@/skills').SkillsSettings

interface FakeBridge {
  added: string[]
  addInputs: Array<{ content: string; category?: string; scope?: unknown }>
  summaries: Array<{ sessionId: string; summary: string }>
}

function installBridge(): FakeBridge {
  const state: FakeBridge = { added: [], addInputs: [], summaries: [] }
  const seen = new Set<string>()
  const api = {
    addDeduped: vi.fn(async (input: { content: string; category?: string; scope?: unknown }) => {
      const key = input.content.trim().toLowerCase()
      if (seen.has(key)) return { memory: null, operation: 'noop' }
      seen.add(key)
      state.addInputs.push(input)
      state.added.push(input.content)
      return { memory: { id: `id-${state.added.length}` }, operation: 'added' }
    }),
    summaries: {
      upsert: vi.fn(async (sessionId: string, summary: string) => {
        state.summaries.push({ sessionId, summary })
        return { sessionId, summary, updatedAt: Date.now() }
      }),
    },
  }
  ;(window as unknown as { memory: typeof api }).memory = api
  return state
}

const baseSettings = {
  aiModel: 'test-model',
  skills: enabledSkills,
  configuredModels: [{ id: 'test-model', name: 'Test', provider: 'openrouter' }],
} as never

describe('parseExtractionResponse', () => {
  it('parses a clean JSON object', () => {
    const r = parseExtractionResponse('{"facts":["a","b"],"summary":"chat about x"}')
    expect(r?.facts).toEqual([
      { content: 'a', category: 'context' },
      { content: 'b', category: 'context' },
    ])
    expect(r?.summary).toBe('chat about x')
  })

  it('tolerates surrounding prose / code fences', () => {
    const r = parseExtractionResponse('Sure!\n```json\n{"facts":["x"],"summary":"y"}\n```')
    expect(r?.facts).toEqual([{ content: 'x', category: 'context' }])
  })

  it('parses categorized facts and normalizes invalid or missing categories', () => {
    const r = parseExtractionResponse(
      '{"facts":[{"content":"User prefers concise answers","category":"preference"},{"content":"User is building ZuraAI","category":"made-up"},{"content":"User uses Bun"}],"summary":""}'
    )
    expect(r?.facts).toEqual([
      { content: 'User prefers concise answers', category: 'preference' },
      { content: 'User is building ZuraAI', category: 'context' },
      { content: 'User uses Bun', category: 'context' },
    ])
  })

  it('returns null on garbage', () => {
    expect(parseExtractionResponse('not json')).toBeNull()
  })
})

describe('runMemoryExtraction', () => {
  beforeEach(() => {
    generateTitleTextForModel.mockReset()
  })
  afterEach(() => {
    delete (window as { memory?: unknown }).memory
    vi.clearAllMocks()
  })

  it('persists extracted facts (ADD-only) and upserts a summary', async () => {
    const state = installBridge()
    generateTitleTextForModel.mockResolvedValue(
      '{"facts":[{"content":"User studies at SRM","category":"personal"}],"summary":"Discussed coursework"}'
    )

    const result = await runMemoryExtraction({
      settings: baseSettings,
      sessionId: 's1',
      messages: [{ role: 'user', content: 'I study at SRM University' }],
    })

    expect(result?.facts).toEqual([{ content: 'User studies at SRM', category: 'personal' }])
    expect(state.added).toEqual(['User studies at SRM'])
    expect(state.addInputs[0]).toMatchObject({ category: 'personal' })
    expect(state.summaries).toEqual([{ sessionId: 's1', summary: 'Discussed coursework' }])
  })

  it('does not store reminder requests as memories or summaries', async () => {
    const state = installBridge()
    generateTitleTextForModel.mockResolvedValue(
      '{"facts":["User wants to be reminded tomorrow to submit the report"],"summary":"Set a reminder to submit the report"}'
    )

    const result = await runMemoryExtraction({
      settings: baseSettings,
      sessionId: 's-reminder',
      messages: [{ role: 'user', content: 'Remind me tomorrow to submit the report' }],
    })

    expect(result).toEqual({ facts: [], summary: '' })
    expect(state.added).toEqual([])
    expect(state.summaries).toEqual([])
  })

  it('does not store web lookout requests as memories or summaries', async () => {
    const state = installBridge()
    generateTitleTextForModel.mockResolvedValue(
      '{"facts":["User wants to watch https://example.com/pricing for changes"],"summary":"Set up pricing page monitoring"}'
    )

    const result = await runMemoryExtraction({
      settings: baseSettings,
      sessionId: 's-lookout',
      messages: [{ role: 'user', content: 'Watch https://example.com/pricing for changes' }],
    })

    expect(result).toEqual({ facts: [], summary: '' })
    expect(state.added).toEqual([])
    expect(state.summaries).toEqual([])
  })

  it('does not store remember-to-remind requests as memories or summaries', async () => {
    const state = installBridge()
    generateTitleTextForModel.mockResolvedValue(
      '{"facts":["User wants a recurring Friday reminder"],"summary":"Discussed a weekly reminder"}'
    )

    const result = await runMemoryExtraction({
      settings: baseSettings,
      sessionId: 's-remember-remind',
      messages: [
        { role: 'user', content: 'Remember to remind me every Friday to review invoices' },
      ],
    })

    expect(result).toEqual({ facts: [], summary: '' })
    expect(state.added).toEqual([])
    expect(state.summaries).toEqual([])
  })

  it('keeps normal durable memory facts', async () => {
    const state = installBridge()
    generateTitleTextForModel.mockResolvedValue(
      '{"facts":["User prefers concise answers"],"summary":"Discussed response style"}'
    )

    const result = await runMemoryExtraction({
      settings: baseSettings,
      sessionId: 's-durable',
      messages: [{ role: 'user', content: 'I prefer concise answers' }],
    })

    expect(result).toEqual({
      facts: [{ content: 'User prefers concise answers', category: 'context' }],
      summary: 'Discussed response style',
    })
    expect(state.added).toEqual(['User prefers concise answers'])
    expect(state.summaries).toEqual([
      { sessionId: 's-durable', summary: 'Discussed response style' },
    ])
  })

  it('keeps durable facts in mixed chats while dropping reminder-like facts', async () => {
    const state = installBridge()
    generateTitleTextForModel.mockResolvedValue(
      '{"facts":["User prefers concise answers","User wants a reminder tomorrow to submit the report"],"summary":"Discussed user response preferences"}'
    )

    const result = await runMemoryExtraction({
      settings: baseSettings,
      sessionId: 's-mixed',
      messages: [
        {
          role: 'user',
          content: 'I prefer concise answers. Also remind me tomorrow to submit the report.',
        },
      ],
    })

    expect(result).toEqual({
      facts: [{ content: 'User prefers concise answers', category: 'context' }],
      summary: 'Discussed user response preferences',
    })
    expect(state.added).toEqual(['User prefers concise answers'])
    expect(state.summaries).toEqual([
      { sessionId: 's-mixed', summary: 'Discussed user response preferences' },
    ])
  })

  it('persists extracted facts with the provided Space memory scope', async () => {
    const state = installBridge()
    generateTitleTextForModel.mockResolvedValue(
      '{"facts":["User is building ZuraAI Spaces"],"summary":"Discussed Spaces"}'
    )

    await runMemoryExtraction({
      settings: baseSettings,
      sessionId: 's-space',
      scope: { type: 'project', projectId: 'space-1' },
      messages: [{ role: 'user', content: 'Remember this for the Spaces project' }],
    })

    expect(state.addInputs[0]).toMatchObject({
      content: 'User is building ZuraAI Spaces',
      category: 'context',
      scope: { type: 'project', projectId: 'space-1' },
    })
  })

  it('uses settings.memoryModel for the extraction call when set', async () => {
    installBridge()
    generateTitleTextForModel.mockResolvedValue('{"facts":[],"summary":""}')

    await runMemoryExtraction({
      settings: { ...(baseSettings as object), memoryModel: 'dedicated-memory-model' } as never,
      sessionId: 's1',
      messages: [{ role: 'user', content: 'hello' }],
    })

    expect(generateTitleTextForModel).toHaveBeenCalledTimes(1)
    // call signature: (settings, model, prompt)
    expect(generateTitleTextForModel.mock.calls[0][1]).toBe('dedicated-memory-model')
    expect(generateTitleTextForModel.mock.calls[0][3]).toMatchObject({
      jsonMode: true,
      maxTokens: 1024,
    })
    expect(generateTitleTextForModel.mock.calls[0][3]?.signal).toBeInstanceOf(AbortSignal)
  })

  it('falls back to the active chat model when memoryModel is unset', async () => {
    installBridge()
    generateTitleTextForModel.mockResolvedValue('{"facts":[],"summary":""}')

    await runMemoryExtraction({
      settings: { ...(baseSettings as object), memoryModel: '' } as never,
      sessionId: 's1',
      messages: [{ role: 'user', content: 'hello' }],
    })

    expect(generateTitleTextForModel).toHaveBeenCalledTimes(1)
    expect(generateTitleTextForModel.mock.calls[0][1]).toBe('test-model')
  })

  it('skips the summary upsert when the model returns an empty summary', async () => {
    const state = installBridge()
    generateTitleTextForModel.mockResolvedValue('{"facts":["User likes tea"],"summary":""}')

    const result = await runMemoryExtraction({
      settings: baseSettings,
      sessionId: 's1',
      messages: [{ role: 'user', content: 'what was the 9/11 death toll?' }],
    })

    expect(result?.summary).toBe('')
    expect(state.added).toEqual(['User likes tea'])
    expect(state.summaries).toEqual([])
  })

  it('skips the summary upsert when the model omits the summary field', async () => {
    const state = installBridge()
    generateTitleTextForModel.mockResolvedValue('{"facts":[]}')

    const result = await runMemoryExtraction({
      settings: baseSettings,
      sessionId: 's1',
      messages: [{ role: 'user', content: 'define photosynthesis' }],
    })

    expect(result?.summary).toBe('')
    expect(state.summaries).toEqual([])
  })

  it('dedupes duplicate facts across runs via addDeduped NOOP', async () => {
    const state = installBridge()
    generateTitleTextForModel.mockResolvedValue('{"facts":["User likes tea"],"summary":"s"}')

    await runMemoryExtraction({
      settings: baseSettings,
      sessionId: 's1',
      messages: [{ role: 'user', content: 'I like tea' }],
    })
    await runMemoryExtraction({
      settings: baseSettings,
      sessionId: 's2',
      messages: [{ role: 'user', content: 'tea again' }],
    })

    expect(state.added).toEqual(['User likes tea'])
  })

  it('is a no-op when the Memory skill is disabled', async () => {
    const state = installBridge()
    const result = await runMemoryExtraction({
      settings: { ...(baseSettings as object), skills: disabledSkills } as never,
      sessionId: 's1',
      messages: [{ role: 'user', content: 'hello' }],
    })
    expect(result).toBeNull()
    expect(generateTitleTextForModel).not.toHaveBeenCalled()
    expect(state.added).toEqual([])
  })

  it('is a no-op in manual-only mode (autoManage off)', async () => {
    const state = installBridge()
    const manualOnly = {
      memory: { enabled: true, config: { autoManage: false } },
    } as unknown as import('@/skills').SkillsSettings
    const result = await runMemoryExtraction({
      settings: { ...(baseSettings as object), skills: manualOnly } as never,
      sessionId: 's1',
      messages: [{ role: 'user', content: 'I study at SRM' }],
    })
    expect(result).toBeNull()
    expect(generateTitleTextForModel).not.toHaveBeenCalled()
    expect(state.added).toEqual([])
  })

  it('is a no-op (returns null) when the LLM call fails', async () => {
    const state = installBridge()
    generateTitleTextForModel.mockRejectedValue(new Error('boom'))
    const result = await runMemoryExtraction({
      settings: baseSettings,
      sessionId: 's1',
      messages: [{ role: 'user', content: 'hello' }],
    })
    expect(result).toBeNull()
    expect(state.added).toEqual([])
  })

  it('emits a pinpoint diagnostic when the extraction response is not JSON', async () => {
    installBridge()
    generateTitleTextForModel.mockResolvedValue('I could not find anything durable to remember.')

    const result = await runMemoryExtraction({
      settings: baseSettings,
      sessionId: 's1',
      messages: [{ role: 'user', content: 'hello' }],
    })

    expect(result).toBeNull()
    expect(appendChatDiagnosticEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        phase: 'memory-extraction-error',
        memoryErrorCode: 'missing-json-object',
        error: 'Memory extraction response did not contain a JSON object',
        responseLength: 46,
        responsePreview: 'I could not find anything durable to remember.',
      })
    )
  })

  // Regression: a DeepSeek reasoner (e.g. deepseek-v4-pro) previously returned
  // empty content (reasoning consumed the token budget), surfacing as an
  // `empty-response` error. With thinking explicitly disabled + the larger
  // budget, the provider returns parseable JSON and extraction succeeds.
  it('parses facts/summary for a DeepSeek reasoner instead of empty-response', async () => {
    const state = installBridge()
    generateTitleTextForModel.mockResolvedValue(
      '{"facts":["User prefers dark mode"],"summary":"Set up the app theme"}'
    )

    const reasonerSettings = {
      ...(baseSettings as object),
      memoryModel: 'deepseek-v4-pro',
      deepseekModels: [{ id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', provider: 'deepseek' }],
    } as never

    const result = await runMemoryExtraction({
      settings: reasonerSettings,
      sessionId: 's-reasoner',
      messages: [{ role: 'user', content: 'please use dark mode going forward' }],
    })

    expect(result?.facts).toEqual([{ content: 'User prefers dark mode', category: 'context' }])
    expect(state.added).toEqual(['User prefers dark mode'])
    expect(state.summaries).toEqual([{ sessionId: 's-reasoner', summary: 'Set up the app theme' }])
    // No error diagnostic should be emitted on the success path.
    const errorCalls = (
      appendChatDiagnosticEvent as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls.filter(
      (call) => (call[0] as { phase?: string })?.phase === 'memory-extraction-error'
    )
    expect(errorCalls).toEqual([])
    // Budget hardening: extraction requests the larger token budget.
    expect(generateTitleTextForModel.mock.calls[0][3]).toMatchObject({ maxTokens: 1024 })
  })
})

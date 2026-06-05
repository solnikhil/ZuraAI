import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  parseExtractionResponse,
  runMemoryExtraction,
} from './memoryExtraction'

// Mock the provider call so no network happens.
const generateTitleTextForModel = vi.fn()
vi.mock('@/providers/providerRuntime', () => ({
  generateTitleTextForModel: (...args: unknown[]) => generateTitleTextForModel(...args),
}))

const enabledSkills = { memory: { enabled: true } } as unknown as import('@/skills').SkillsSettings
const disabledSkills = { memory: { enabled: false } } as unknown as import('@/skills').SkillsSettings

interface FakeBridge {
  added: string[]
  summaries: Array<{ sessionId: string; summary: string }>
}

function installBridge(): FakeBridge {
  const state: FakeBridge = { added: [], summaries: [] }
  const seen = new Set<string>()
  const api = {
    addDeduped: vi.fn(async (input: { content: string }) => {
      const key = input.content.trim().toLowerCase()
      if (seen.has(key)) return { memory: null, operation: 'noop' }
      seen.add(key)
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
    expect(r?.facts).toEqual(['a', 'b'])
    expect(r?.summary).toBe('chat about x')
  })

  it('tolerates surrounding prose / code fences', () => {
    const r = parseExtractionResponse('Sure!\n```json\n{"facts":["x"],"summary":"y"}\n```')
    expect(r?.facts).toEqual(['x'])
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
      '{"facts":["User studies at SRM"],"summary":"Discussed coursework"}'
    )

    const result = await runMemoryExtraction({
      settings: baseSettings,
      sessionId: 's1',
      messages: [{ role: 'user', content: 'I study at SRM University' }],
    })

    expect(result?.facts).toEqual(['User studies at SRM'])
    expect(state.added).toEqual(['User studies at SRM'])
    expect(state.summaries).toEqual([{ sessionId: 's1', summary: 'Discussed coursework' }])
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
})

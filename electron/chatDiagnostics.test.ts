// @vitest-environment node

import { mkdtemp, readFile, rm, stat } from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electronMock = vi.hoisted(() => ({
  userDataPath: '',
  isPackaged: false,
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => electronMock.userDataPath),
    get isPackaged() {
      return electronMock.isPackaged
    },
  },
}))

describe('chat diagnostics persistence', () => {
  beforeEach(async () => {
    vi.resetModules()
    electronMock.userDataPath = await mkdtemp(path.join(os.tmpdir(), 'zura-chat-diagnostics-'))
    electronMock.isPackaged = false
  })

  afterEach(async () => {
    await rm(electronMock.userDataPath, { recursive: true, force: true })
  })

  it('appends sanitized dev-only events without secrets or large raw payloads', async () => {
    const diagnostics = await import('./chatDiagnostics')

    const appended = await diagnostics.appendChatDiagnosticEvent({
      sessionId: 'session/1',
      messageId: 'message-1',
      phase: 'tool-start',
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      tool: {
        id: 'tool-1',
        name: 'web_search',
        arguments: {
          query: 'prompt caching',
          apiKey: 'secret-key',
          imageData: 'data:image/png;base64,abc',
          nested: { Authorization: 'Bearer secret' },
        },
      },
    })

    expect(appended).toBe(true)

    const filePath = path.join(
      electronMock.userDataPath,
      'debug-sessions',
      `${encodeURIComponent('session/1')}.jsonl`
    )
    const event = JSON.parse((await readFile(filePath, 'utf8')).trim())

    expect(event).toMatchObject({
      sessionId: 'session/1',
      messageId: 'message-1',
      phase: 'tool-start',
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      tool: {
        id: 'tool-1',
        name: 'web_search',
      },
    })
    expect(event.tool.arguments.apiKey).toBe('[redacted]')
    expect(event.tool.arguments.imageData).toBe('[redacted]')
    expect(event.tool.arguments.nested.Authorization).toBe('[redacted]')
  })

  it('does not persist events in packaged builds', async () => {
    electronMock.isPackaged = true
    const diagnostics = await import('./chatDiagnostics')

    const appended = await diagnostics.appendChatDiagnosticEvent({
      sessionId: 'session-1',
      messageId: 'message-1',
      phase: 'finish',
    })

    expect(appended).toBe(false)
  })

  it('creates a zura-chat debug reference in development builds', async () => {
    const diagnostics = await import('./chatDiagnostics')

    const reference = diagnostics.getChatDebugReference('session-1')

    expect(reference).toMatch(/^zura-chat:\/\/session-1\?userData=/)
    const encodedUserData = new URL(reference!).searchParams.get('userData')!
    const decodedUserData = Buffer.from(
      encodedUserData.replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    ).toString('utf8')
    expect(decodedUserData).toBe(electronMock.userDataPath)
  })

  it('persists sanitized context, request-shape, and raw usage diagnostics', async () => {
    const diagnostics = await import('./chatDiagnostics')

    const appended = await diagnostics.appendChatDiagnosticEvent({
      sessionId: 'session-rich',
      messageId: 'message-rich',
      phase: 'usage',
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      round: 0,
      roundType: 'tool-enabled',
      rawUsage: {
        prompt_tokens: 10,
        completion_tokens: 2,
        nested: {
          api_key: 'secret',
        },
      },
    })

    expect(appended).toBe(true)
    const filePath = path.join(electronMock.userDataPath, 'debug-sessions', 'session-rich.jsonl')
    const event = JSON.parse((await readFile(filePath, 'utf8')).trim())

    expect(event).toMatchObject({
      phase: 'usage',
      round: 0,
      roundType: 'tool-enabled',
      rawUsage: {
        prompt_tokens: 10,
        completion_tokens: 2,
        nested: {
          api_key: '[redacted]',
        },
      },
    })
  })

  it('caps session diagnostics to a rolling event window', async () => {
    const diagnostics = await import('./chatDiagnostics')

    for (let index = 0; index < 510; index += 1) {
      await diagnostics.appendChatDiagnosticEvent({
        sessionId: 'session-rolling',
        messageId: `message-${index}`,
        phase: 'usage',
        usage: {
          inputTokens: index,
          outputTokens: 1,
          totalTokens: index + 1,
        },
      })
    }

    const filePath = path.join(
      electronMock.userDataPath,
      'debug-sessions',
      'session-rolling.jsonl'
    )
    const raw = await readFile(filePath, 'utf8')
    const lines = raw.trim().split('\n')
    const fileStat = await stat(filePath)

    expect(lines).toHaveLength(500)
    expect(JSON.parse(lines[0]).messageId).toBe('message-10')
    expect(fileStat.size).toBeLessThanOrEqual(2 * 1024 * 1024)
  })

  it('sanitizes stream-chunk events and truncates long text deltas', async () => {
    const diagnostics = await import('./chatDiagnostics')

    const longDelta = 'x'.repeat(400)
    const appended = await diagnostics.appendChatDiagnosticEvent({
      sessionId: 'session-stream',
      messageId: 'message-stream',
      phase: 'stream-chunk',
      provider: 'openrouter',
      streamChunk: {
        chunkIndex: 7,
        cumulativeTextLength: 1234,
        textDelta: longDelta,
        toolCallDeltaCount: 2,
      },
    })

    expect(appended).toBe(true)
    const filePath = path.join(
      electronMock.userDataPath,
      'debug-sessions',
      'session-stream.jsonl'
    )
    const event = JSON.parse((await readFile(filePath, 'utf8')).trim())

    expect(event.phase).toBe('stream-chunk')
    expect(event.streamChunk.chunkIndex).toBe(7)
    expect(event.streamChunk.cumulativeTextLength).toBe(1234)
    expect(event.streamChunk.toolCallDeltaCount).toBe(2)
    expect(event.streamChunk.textDelta.length).toBeLessThan(longDelta.length)
    expect(event.streamChunk.textDelta).toMatch(/\.\.\.\[truncated\]$/)
  })

  it('accepts stream-chunk events with missing optional fields', async () => {
    const diagnostics = await import('./chatDiagnostics')

    const appended = await diagnostics.appendChatDiagnosticEvent({
      sessionId: 'session-stream-min',
      messageId: 'message-stream-min',
      phase: 'stream-chunk',
      streamChunk: {
        chunkIndex: 1,
        cumulativeTextLength: 4,
      },
    })

    expect(appended).toBe(true)
    const filePath = path.join(
      electronMock.userDataPath,
      'debug-sessions',
      'session-stream-min.jsonl'
    )
    const event = JSON.parse((await readFile(filePath, 'utf8')).trim())
    expect(event.streamChunk).toEqual({ chunkIndex: 1, cumulativeTextLength: 4 })
  })

  it('persists memory-extraction events and their durable-fact metadata', async () => {
    const diagnostics = await import('./chatDiagnostics')

    const startAppended = await diagnostics.appendChatDiagnosticEvent({
      sessionId: 'session-memory',
      messageId: 'memory-extraction',
      phase: 'memory-extraction-start',
      model: 'fake-model',
      messageCount: 6,
    })
    const resultAppended = await diagnostics.appendChatDiagnosticEvent({
      sessionId: 'session-memory',
      messageId: 'memory-extraction',
      phase: 'memory-extraction-result',
      model: 'fake-model',
      factCount: 2,
      summaryKept: false,
    })

    expect(startAppended).toBe(true)
    expect(resultAppended).toBe(true)

    const events = await diagnostics.readChatDiagnosticEvents('session-memory')
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({
      phase: 'memory-extraction-start',
      model: 'fake-model',
      messageCount: 6,
    })
    expect(events[1]).toMatchObject({
      phase: 'memory-extraction-result',
      factCount: 2,
      summaryKept: false,
    })
  })

  it('rejects events with an unknown phase', async () => {
    const diagnostics = await import('./chatDiagnostics')

    const appended = await diagnostics.appendChatDiagnosticEvent({
      sessionId: 'session-bad',
      messageId: 'message-bad',
      // @ts-expect-error - intentionally invalid phase to confirm rejection
      phase: 'totally-made-up',
    })

    expect(appended).toBe(false)
  })

  it('broadcasts each accepted event and skips invalid ones', async () => {
    const diagnostics = await import('./chatDiagnostics')
    const broadcaster = vi.fn()
    diagnostics.setChatDiagnosticBroadcaster(broadcaster)

    const accepted = await diagnostics.appendChatDiagnosticEvent({
      sessionId: 'session-broadcast',
      messageId: 'message-1',
      phase: 'finish',
    })
    expect(accepted).toBe(true)
    expect(broadcaster).toHaveBeenCalledTimes(1)
    expect(broadcaster).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-broadcast',
        messageId: 'message-1',
        phase: 'finish',
      })
    )

    const rejected = await diagnostics.appendChatDiagnosticEvent({
      sessionId: 'session-broadcast',
      messageId: 'message-2',
      // @ts-expect-error - invalid phase
      phase: 'nope',
    })
    expect(rejected).toBe(false)
    expect(broadcaster).toHaveBeenCalledTimes(1)

    diagnostics.setChatDiagnosticBroadcaster(null)
  })

  it('recovers when the broadcaster throws', async () => {
    const diagnostics = await import('./chatDiagnostics')
    const broadcaster = vi.fn(() => {
      throw new Error('boom')
    })
    diagnostics.setChatDiagnosticBroadcaster(broadcaster)
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const accepted = await diagnostics.appendChatDiagnosticEvent({
      sessionId: 'session-broadcast-throw',
      messageId: 'message-1',
      phase: 'finish',
    })

    expect(accepted).toBe(true)
    expect(broadcaster).toHaveBeenCalledTimes(1)
    expect(consoleSpy).toHaveBeenCalled()

    consoleSpy.mockRestore()
    diagnostics.setChatDiagnosticBroadcaster(null)
  })

  it('reads back persisted events via readChatDiagnosticEvents', async () => {
    const diagnostics = await import('./chatDiagnostics')

    await diagnostics.appendChatDiagnosticEvent({
      sessionId: 'session-read',
      messageId: 'message-a',
      phase: 'request-start',
    })
    await diagnostics.appendChatDiagnosticEvent({
      sessionId: 'session-read',
      messageId: 'message-b',
      phase: 'finish',
    })

    const events = await diagnostics.readChatDiagnosticEvents('session-read')
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({ messageId: 'message-a', phase: 'request-start' })
    expect(events[1]).toMatchObject({ messageId: 'message-b', phase: 'finish' })
  })

  it('returns an empty list when reading a missing session file', async () => {
    const diagnostics = await import('./chatDiagnostics')
    const events = await diagnostics.readChatDiagnosticEvents('does-not-exist')
    expect(events).toEqual([])
  })

  it('returns an empty list for invalid sessionId or in packaged builds', async () => {
    const diagnostics = await import('./chatDiagnostics')
    expect(await diagnostics.readChatDiagnosticEvents('')).toEqual([])
    expect(await diagnostics.readChatDiagnosticEvents(null)).toEqual([])

    electronMock.isPackaged = true
    vi.resetModules()
    const packagedDiagnostics = await import('./chatDiagnostics')
    expect(await packagedDiagnostics.readChatDiagnosticEvents('session-read')).toEqual([])
  })

  it('skips malformed JSONL lines when reading events', async () => {
    const diagnostics = await import('./chatDiagnostics')
    await diagnostics.appendChatDiagnosticEvent({
      sessionId: 'session-malformed',
      messageId: 'message-good',
      phase: 'finish',
    })

    const filePath = path.join(
      electronMock.userDataPath,
      'debug-sessions',
      'session-malformed.jsonl'
    )
    // Append a garbage line directly to simulate corruption.
    const fsModule = await import('fs/promises')
    await fsModule.appendFile(filePath, 'this-is-not-json\n')

    const events = await diagnostics.readChatDiagnosticEvents('session-malformed')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ messageId: 'message-good' })
  })
})

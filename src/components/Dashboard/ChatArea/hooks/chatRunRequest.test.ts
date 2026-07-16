import { describe, expect, it } from 'vitest'

import type { Settings } from '../../../../contexts/settingsStore'
import { ChatRunController } from './chatRunController'
import { buildChatRunRequest } from './chatRunRequest'

const settings = {
  aiModel: 'test-model',
  modelProvider: 'groq',
  temperature: 0.4,
  maxTokens: 900,
  streamResponses: true,
  groqApiKey: 'key',
} as Settings

describe('buildChatRunRequest', () => {
  it.each([
    ['send', true, true],
    ['regenerate', false, false],
  ] as const)('keeps common request invariants for %s', (kind, enableTools, sync) => {
    const run = new ChatRunController(kind, { id: `${kind}-run`, startedAt: 123 })
    const request = buildChatRunRequest({
      run,
      settings,
      sessionId: 'session-1',
      messageId: 'message-1',
      messages: [{ role: 'user', content: 'hello' }],
      researchMaxRounds: enableTools ? 3 : 0,
      enableTools,
      syncToStreamingContext: sync,
      includeImageModalities: kind === 'regenerate',
    })

    expect(request).toMatchObject({
      provider: 'groq',
      model: 'test-model',
      sessionId: 'session-1',
      messageId: 'message-1',
      startTime: 123,
      signal: run.signal,
      enableTools,
      syncToStreamingContext: sync,
    })
    expect(request.settingsOverride).toMatchObject({
      temperature: 0.4,
      maxTokens: 900,
      streamResponses: true,
    })
  })
})

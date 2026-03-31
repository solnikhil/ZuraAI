import { describe, expect, it, vi } from 'vitest'

import {
  appendCompletedThinkingBlock,
  buildFollowUpMessages,
  buildThinkingBlocksFromResults,
  buildFinalSynthesisMessages,
  buildRecoverySynthesisMessages,
  FINAL_SYNTHESIS_PROMPT,
  FINAL_SYNTHESIS_RECOVERY_PROMPT,
  getThinkingTranscript,
  publishStreamingToolResults,
} from './streamingUtils'

describe('streamingUtils final synthesis helpers', () => {
  it('prepends a final synthesis instruction before follow-up messages', () => {
    const messages = buildFinalSynthesisMessages(
      'research context',
      6,
      8,
      [{ role: 'user', content: 'Why is Silicon Valley famous?' }],
      { role: 'assistant', content: 'I will search more.', tool_calls: [] },
      [{ role: 'tool', content: 'search result' }]
    )

    expect(messages[0]).toEqual({ role: 'system', content: FINAL_SYNTHESIS_PROMPT })
    expect(messages.some((message) => message.role === 'tool')).toBe(true)
    expect(messages.some((message) => message.content === 'research context')).toBe(true)
  })

  it('builds a recovery synthesis instruction when the first synthesis returns empty', () => {
    const messages = buildRecoverySynthesisMessages(
      'research context',
      6,
      8,
      [{ role: 'user', content: 'Why is Silicon Valley famous?' }],
      { role: 'assistant', content: 'I will search more.', tool_calls: [] },
      [{ role: 'tool', content: 'search result' }]
    )

    expect(messages[0]).toEqual({ role: 'system', content: FINAL_SYNTHESIS_RECOVERY_PROMPT })
    expect(messages.some((message) => message.role === 'tool')).toBe(true)
    expect(messages.some((message) => message.content === 'research context')).toBe(true)
  })

  it('stores each completed reasoning segment as its own thinking block', () => {
    const blocks = appendCompletedThinkingBlock([], 'Initial reasoning', 900)
    const nextBlocks = appendCompletedThinkingBlock(blocks, 'Follow-up reasoning', 1100)

    expect(nextBlocks).toHaveLength(2)
    expect(nextBlocks[0]).toMatchObject({
      type: 'thinking',
      content: 'Initial reasoning',
      duration: 900,
    })
    expect(nextBlocks[1]).toMatchObject({
      type: 'thinking',
      content: 'Follow-up reasoning',
      duration: 1100,
    })
  })

  it('builds fallback reasoning transcripts from completed blocks and the active segment', () => {
    const transcript = getThinkingTranscript(
      [
        { type: 'thinking', content: 'Initial reasoning', duration: 900, timestamp: 1 },
        { type: 'searching', query: 'query', timestamp: 2 },
      ],
      'Follow-up reasoning'
    )

    expect(transcript).toBe('Initial reasoning\n\n---\n\nFollow-up reasoning')
  })

  it('publishes tool results into streaming state as soon as they complete', () => {
    const updateStreaming = vi.fn()
    const updateStreamingMessage = vi.fn()
    const thinkingBlocks = [
      {
        type: 'tool' as const,
        toolName: 'mcp__filesystem__read_file',
        timestamp: 1,
      },
    ]
    const toolResults = [
      {
        toolCall: {
          id: 'tool-1',
          name: 'mcp__filesystem__read_file',
          arguments: { path: '/tmp/demo.txt' },
        },
        result: {
          success: true,
          data: { text: 'demo' },
          executionTime: 42,
          metadata: {
            origin: 'mcp' as const,
            serverId: 'server-1',
            serverName: 'Filesystem',
            namespacedToolName: 'mcp__filesystem__read_file',
            originalToolName: 'read_file',
            trusted: true,
            approvalState: 'approved' as const,
            durationMs: 42,
            outcome: 'success' as const,
          },
        },
      },
    ]

    publishStreamingToolResults(
      updateStreaming,
      updateStreamingMessage,
      'session-1',
      'message-1',
      toolResults,
      thinkingBlocks
    )

    expect(updateStreaming).toHaveBeenCalledWith({ toolResults })
    expect(updateStreamingMessage).toHaveBeenCalledWith('session-1', 'message-1', {
      toolResults,
    })
  })

  it('builds inline tool timeline blocks for completed MCP executions', () => {
    const blocks = buildThinkingBlocksFromResults(
      [
        {
          toolCall: {
            id: 'tool-1',
            name: 'mcp__filesystem__read_file',
            arguments: { path: '/tmp/demo.txt' },
          },
          result: {
            success: true,
            data: { text: 'demo' },
            executionTime: 42,
            metadata: {
              origin: 'mcp' as const,
              serverId: 'filesystem',
              serverName: 'Filesystem',
              namespacedToolName: 'mcp__filesystem__read_file',
              originalToolName: 'read_file',
              trusted: true,
              approvalState: 'approved' as const,
              durationMs: 42,
              outcome: 'success' as const,
            },
          },
        },
      ],
      []
    )

    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({
      type: 'tool',
      toolName: 'mcp__filesystem__read_file',
      toolInput: { path: '/tmp/demo.txt' },
      toolOutput: {
        success: true,
        executionTime: 42,
      },
    })
  })

  it('does not append a search timeline block for skipped web_search results', () => {
    const blocks = buildThinkingBlocksFromResults(
      [
        {
          toolCall: {
            id: 'tool-1',
            name: 'web_search',
            arguments: { query: 'zura ai overview' },
          },
          result: {
            success: false,
            error: 'Skipped duplicate web_search query in this response.',
            metadata: {
              origin: 'builtin-main' as const,
              executionDisposition: 'skipped' as const,
              skippedReason: 'duplicate-query' as const,
            },
          },
        },
      ],
      []
    )

    expect(blocks).toEqual([])
  })

  it('does not inject a hard stop prompt just because several research rounds have occurred', () => {
    const messages = buildFollowUpMessages(
      'Research context',
      5,
      5,
      [{ role: 'user', content: 'Find sources' }],
      { role: 'assistant', content: '', tool_calls: [] },
      [{ role: 'tool', content: 'Results', tool_call_id: 'call_1' }]
    )

    const systemMessages = messages
      .filter((message) => message.role === 'system')
      .map((message) => String(message.content))

    expect(systemMessages).toEqual(['Research context'])
  })
})

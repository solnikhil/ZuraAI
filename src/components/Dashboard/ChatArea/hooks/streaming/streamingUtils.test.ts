import { describe, expect, it, vi } from 'vitest'

import {
  appendCompletedThinkingBlock,
  buildAgentVerificationMessages,
  buildDeterministicSearchSynthesis,
  buildFollowUpMessages,
  buildThinkingBlocksFromResults,
  buildFinalSynthesisMessages,
  buildRecoverySynthesisMessages,
  DETERMINISTIC_SEARCH_SYNTHESIS_PREFIX,
  extractSearchEvidenceItems,
  FINAL_SYNTHESIS_BUDGET_EXHAUSTED_PROMPT,
  FINAL_SYNTHESIS_EMPTY_BATCH_PROMPT,
  FINAL_SYNTHESIS_PROMPT,
  FINAL_SYNTHESIS_RECOVERY_PROMPT,
  getThinkingTranscript,
  publishStreamingToolResults,
  shouldRetryUngroundedSearchSynthesis,
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

  it('tells the model when final synthesis is required because the web search budget is exhausted', () => {
    const messages = buildFinalSynthesisMessages(
      'research context',
      6,
      8,
      [{ role: 'user', content: 'Find recent benchmark sources' }],
      { role: 'assistant', content: 'I will search more.', tool_calls: [] },
      [{ role: 'tool', content: 'search result' }],
      'budget'
    )

    expect(messages[0]).toEqual({ role: 'system', content: FINAL_SYNTHESIS_BUDGET_EXHAUSTED_PROMPT })
    expect(String(messages[0].content)).toContain('WEB SEARCH BUDGET EXHAUSTED')
    expect(String(messages[0].content)).toContain('using only the results already returned')
  })

  it('tells the model when final synthesis is required because no executable search query remained', () => {
    const messages = buildFinalSynthesisMessages(
      'research context',
      3,
      2,
      [{ role: 'user', content: 'Find recent product details' }],
      { role: 'assistant', content: 'I will search more.', tool_calls: [] },
      [{ role: 'tool', content: 'search result' }],
      'empty-batch'
    )

    expect(messages[0]).toEqual({ role: 'system', content: FINAL_SYNTHESIS_EMPTY_BATCH_PROMPT })
    expect(String(messages[0].content)).toContain('NO EXECUTABLE WEB SEARCH REMAINED')
    expect(String(messages[0].content)).toContain('using only the results already returned')
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
            error: 'Skipped web_search call because the per-response search budget has been reached.',
            metadata: {
              origin: 'builtin-main' as const,
              executionDisposition: 'skipped' as const,
              skippedReason: 'budget' as const,
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

  it('prepends an agent verification prompt before regular follow-up context', () => {
    const messages = buildAgentVerificationMessages(
      {
        category: 'file',
        reason: 'File changes were made and need a read-only filesystem check.',
        preferredTools: ['file_search', 'file_read'],
        mutatingToolNames: ['file_move'],
      },
      'Research context',
      1,
      0,
      [{ role: 'user', content: 'Sort my desktop' }],
      { role: 'assistant', content: '', tool_calls: [] },
      [{ role: 'tool', content: 'Moved file', tool_call_id: 'call_1' }]
    )

    expect(messages[0].role).toBe('system')
    expect(String(messages[0].content)).toContain('AGENT VERIFICATION REQUIRED')
    expect(String(messages[0].content)).toContain('file_search, file_read')
    expect(messages.some((message) => message.content === 'Research context')).toBe(true)
    expect(messages.some((message) => message.role === 'tool')).toBe(true)
  })

  it('flags knowledge-cutoff fallback text as a failed post-search synthesis', () => {
    expect(
      shouldRetryUngroundedSearchSynthesis(
        'The latest findings as of my knowledge cutoff in 2023 are limited. Consult official documentation for newer updates.'
      )
    ).toBe(true)
  })

  it('flags duplicate-skip fallback text as a failed post-search synthesis', () => {
    expect(
      shouldRetryUngroundedSearchSynthesis(
        "The search results returned no information about Justin Bieber's latest Coachella news, and the system skipped the query as a duplicate."
      )
    ).toBe(true)
  })

  it('flags raw DSML tool markup as a failed post-search synthesis', () => {
    expect(
      shouldRetryUngroundedSearchSynthesis(
        '<| | DSML | | tool_calls><| | DSML | | invoke name="web_search"><| | DSML | | parameter name="query" string="true">latest docs</| | DSML | | parameter></| | DSML | | invoke></| | DSML | | tool_calls>'
      )
    ).toBe(true)
  })

  it('flags fullwidth DSML tool markup as a failed post-search synthesis', () => {
    expect(
      shouldRetryUngroundedSearchSynthesis(
        '<｜｜DSML｜｜tool_calls><｜｜DSML｜｜invoke name="web_search"><｜｜DSML｜｜parameter name="query" string="true">latest docs</｜｜DSML｜｜parameter></｜｜DSML｜｜invoke></｜｜DSML｜｜tool_calls>'
      )
    ).toBe(true)
  })

  it('normalizes successful web_search results into evidence items', () => {
    const evidence = extractSearchEvidenceItems([
      {
        toolCall: {
          id: 'call_1',
          name: 'web_search',
          arguments: { query: 'Kiro ambassador welcome kit' },
        },
        result: {
          success: true,
          data: {
            results: [
              {
                title: 'Kiro Ambassador FAQ',
                url: 'https://example.com/kiro',
                snippet: 'Ambassadors receive onboarding guidance.',
                source: 'example.com',
                date: '2026-05-01',
                score: 0.91,
              },
            ],
          },
        },
      },
    ])

    expect(evidence).toEqual([
      {
        query: 'Kiro ambassador welcome kit',
        title: 'Kiro Ambassador FAQ',
        url: 'https://example.com/kiro',
        source: 'example.com',
        snippet: 'Ambassadors receive onboarding guidance.',
        date: '2026-05-01',
        score: 0.91,
      },
    ])
  })

  it('builds a deterministic search synthesis from successful web_search evidence', () => {
    const synthesis = buildDeterministicSearchSynthesis([
      {
        toolCall: {
          id: 'call_1',
          name: 'web_search',
          arguments: { query: 'weekend getaways near Chennai' },
        },
        result: {
          success: true,
          data: {
            results: [
              {
                title: 'Weekend Getaways from Chennai',
                url: 'https://example.com/chennai',
                snippet: 'Pondicherry, Mahabalipuram, and Yelagiri are common short-trip options.',
                source: 'example.com',
              },
            ],
          },
        },
      },
    ])

    expect(synthesis).toContain(DETERMINISTIC_SEARCH_SYNTHESIS_PREFIX)
    expect(synthesis).toContain('[Weekend Getaways from Chennai](https://example.com/chennai)')
    expect(synthesis).toContain('Pondicherry, Mahabalipuram, and Yelagiri')
  })

  it('does not build deterministic synthesis when no successful web_search evidence exists', () => {
    expect(
      buildDeterministicSearchSynthesis([
        {
          toolCall: {
            id: 'call_1',
            name: 'web_search',
            arguments: { query: 'weekend getaways near Chennai' },
          },
          result: {
            success: false,
            error: 'network failed',
          },
        },
      ])
    ).toBeNull()
  })

  it('does not flag grounded synthesized answers as failed post-search synthesis', () => {
    expect(
      shouldRetryUngroundedSearchSynthesis(
        'The February 2026 release included court records, flight logs, and contact-book references, but many allegations remained unverified.'
      )
    ).toBe(false)
  })
})

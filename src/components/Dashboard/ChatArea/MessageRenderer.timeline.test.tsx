import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TOOL_FOLLOW_UP_SPLIT_MARKER, createToolFollowUpSplitMarker } from './messageTimeline'

let mockWebSearchIncludeImages = true

vi.mock('../../../contexts/SettingsContext', () => ({
  useSettings: () => ({
    settings: {
      aiModel: 'test-model',
      chatBubbleStyle: 'solid',
      webSearchIncludeImages: mockWebSearchIncludeImages,
    },
  }),
}))

vi.mock('../../LazyMarkdown', () => ({
  default: ({ content }: { content: string }) => <div data-testid="markdown">{content}</div>,
}))

vi.mock('../../ThinkingBlock', () => ({
  default: ({
    thinking,
    isThinking,
    isSearching,
    searchQueries,
    activeToolCalls,
    completedBlocks,
  }: {
    thinking?: string
    isThinking?: boolean
    isSearching?: boolean
    searchQueries?: string[]
    activeToolCalls?: Array<{ name: string }>
    completedBlocks?: Array<{ content?: string; query?: string; toolName?: string }>
  }) => (
    <div data-testid="thinking-block">
      {completedBlocks?.map((block, index) => (
        <span key={index}>{block.content || block.query || block.toolName}</span>
      ))}
      {isThinking ? <span>Thinking...</span> : null}
      {isSearching ? <span>Searching</span> : null}
      {searchQueries?.length ? <span>{searchQueries.join(' | ')}</span> : null}
      {activeToolCalls?.length ? <span>Tool Active</span> : null}
      {thinking ? <span>{thinking}</span> : null}
    </div>
  ),
}))

vi.mock('../../ResponseInfo', () => ({
  default: () => null,
}))

vi.mock('./attachmentUtils', () => ({
  formatFileSize: () => '1 KB',
}))

import { MessageRenderer } from './MessageRenderer'

describe('MessageRenderer follow-up timeline', () => {
  beforeEach(() => {
    mockWebSearchIncludeImages = true
  })

  it('renders web search images when the preference is enabled', async () => {
    render(
      <MessageRenderer
        message={{
          id: 'message-images-on',
          role: 'assistant',
          content: 'Here are the results.',
          timestamp: 1,
          toolResults: [
            {
              toolCall: {
                id: 'tool-images-on',
                name: 'web_search',
                arguments: { query: 'cursor pricing' },
              },
              result: {
                success: true,
                data: {
                  source: 'tavily',
                  results: [],
                  images: [
                    { url: 'https://example.com/one.png', description: 'One' },
                    { url: 'https://example.com/two.png', description: 'Two' },
                  ],
                },
              },
            },
          ],
        }}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('2 images from search')).toBeInTheDocument()
    })
  })

  it('hides web search images when the preference is disabled', async () => {
    mockWebSearchIncludeImages = false

    render(
      <MessageRenderer
        message={{
          id: 'message-images-off',
          role: 'assistant',
          content: 'Here are the results.',
          timestamp: 1,
          toolResults: [
            {
              toolCall: {
                id: 'tool-images-off',
                name: 'web_search',
                arguments: { query: 'cursor pricing' },
              },
              result: {
                success: true,
                data: {
                  source: 'tavily',
                  results: [],
                  images: [{ url: 'https://example.com/one.png', description: 'One' }],
                },
              },
            },
          ],
        }}
      />
    )

    await waitFor(() => {
      expect(screen.queryByText('1 image from search')).not.toBeInTheDocument()
    })
  })

  it('renders active tool calls below preamble answer text during tool phase', async () => {
    const { container } = render(
      <MessageRenderer
        message={{
          id: 'message-preamble-active-tool',
          role: 'assistant',
          content: 'Preamble before tools.',
          timestamp: 1,
          thinkingBlocks: [
            {
              type: 'thinking',
              content: 'Initial reasoning',
              duration: 1000,
              timestamp: 1,
            },
          ],
        }}
        isStreaming={true}
        streamPhase="tool"
        activeToolCalls={[{ name: 'system_shell', arguments: { command: 'ls' } }]}
      />
    )

    await waitFor(() => {
      const sequence = Array.from(
        container.querySelectorAll('[data-testid="thinking-block"],[data-testid="markdown"]')
      ).map((node) => node.getAttribute('data-testid'))

      expect(sequence).toEqual(['thinking-block', 'markdown', 'thinking-block'])
      expect(screen.getByText('Tool Active')).toBeInTheDocument()
    })
  })

  it('keeps preamble answer text below thinking during tool phase for stable layout', async () => {
    const { container } = render(
      <MessageRenderer
        message={{
          id: 'message-preamble-tool',
          role: 'assistant',
          content: 'Preamble before tools.',
          timestamp: 1,
          thinkingBlocks: [
            {
              type: 'thinking',
              content: 'Initial reasoning',
              duration: 1000,
              timestamp: 1,
            },
          ],
        }}
        isStreaming={true}
        streamPhase="tool"
      />
    )

    await waitFor(() => {
      const sequence = Array.from(
        container.querySelectorAll('[data-testid="thinking-block"],[data-testid="markdown"]')
      ).map((node) => node.getAttribute('data-testid'))

      expect(sequence).toEqual(['thinking-block', 'markdown'])
    })
  })

  it('does not move markdown above the thinking block when stream phase shifts to tool or reasoning after content arrives', async () => {
    const baseMessage = {
      id: 'message-phase-shift',
      role: 'assistant' as const,
      content: 'Preamble before tools.',
      timestamp: 1,
      thinkingBlocks: [
        {
          type: 'thinking' as const,
          content: 'Initial reasoning',
          duration: 1000,
          timestamp: 1,
        },
      ],
    }

    const { rerender, container } = render(
      <MessageRenderer message={baseMessage} isStreaming={true} streamPhase="answering" />
    )

    for (const phase of ['tool', 'reasoning', 'searching'] as const) {
      rerender(<MessageRenderer message={baseMessage} isStreaming={true} streamPhase={phase} />)

      await waitFor(() => {
        const nodes = Array.from(
          container.querySelectorAll('[data-testid="thinking-block"],[data-testid="markdown"]')
        )
        const sequence = nodes.map((node) => node.getAttribute('data-testid'))
        const markdownIndex = sequence.indexOf('markdown')
        const firstThinkingIndex = sequence.indexOf('thinking-block')

        expect(markdownIndex).toBeGreaterThan(firstThinkingIndex)
      })
    }
  })

  it('renders the thinking/tool activity above its corresponding assistant text', async () => {
    const baseMessage = {
      id: 'message-1',
      role: 'assistant' as const,
      content: 'Initial response.',
      timestamp: 1,
      thinkingBlocks: [
        {
          type: 'thinking' as const,
          content: 'Initial reasoning',
          duration: 1000,
          timestamp: 1,
        },
      ],
    }

    const { rerender, container } = render(
      <MessageRenderer message={baseMessage} isStreaming={true} streamPhase="answering" />
    )

    rerender(
      <MessageRenderer
        message={{
          ...baseMessage,
          thinking: 'Follow-up reasoning',
        }}
        isStreaming={true}
        streamPhase="reasoning"
      />
    )

    await waitFor(() => {
      expect(container.querySelectorAll('[data-testid="thinking-block"]')).toHaveLength(2)
    })

    rerender(
      <MessageRenderer
        message={{
          ...baseMessage,
          content: 'Initial response.Follow-up response.',
          thinking: 'Follow-up reasoning',
        }}
        isStreaming={true}
        streamPhase="reasoning"
      />
    )

    await waitFor(() => {
      const sequence = Array.from(
        container.querySelectorAll('[data-testid="thinking-block"],[data-testid="markdown"]')
      ).map((node) => node.textContent || '')

      expect(sequence).toHaveLength(4)
      expect(sequence[0]).toContain('Initial reasoning')
      expect(sequence[1]).toBe('Initial response.')
      expect(sequence[2]).toContain('Follow-up reasoning')
      expect(sequence[3]).toBe('Follow-up response.')
    })
  })

  it('interleaves each follow-up answer between later thinking activity', async () => {
    const { container } = render(
      <MessageRenderer
        message={{
          id: 'message-multi-round',
          role: 'assistant',
          content: [
            'Good call — verify pricing.',
            createToolFollowUpSplitMarker(1),
            'Here is what pricing shows.',
            createToolFollowUpSplitMarker(3),
            'The main log file is application.log.',
          ].join('\n\n'),
          timestamp: 1,
          thinkingBlocks: [
            {
              type: 'thinking',
              content: 'Initial reasoning',
              duration: 1000,
              timestamp: 1,
            },
            {
              type: 'searching',
              toolName: 'web_search',
              query: 'pricing lookup',
              timestamp: 2,
            },
            {
              type: 'thinking',
              content: 'Follow-up reasoning',
              duration: 800,
              timestamp: 3,
            },
            {
              type: 'tool',
              toolName: 'system_shell',
              timestamp: 4,
            },
          ],
        }}
        isStreaming={false}
      />
    )

    await waitFor(() => {
      const sequence = Array.from(
        container.querySelectorAll('[data-testid="thinking-block"],[data-testid="markdown"]')
      ).map((node) => node.textContent)

      expect(sequence).toEqual([
        'Initial reasoning',
        'Good call — verify pricing.',
        'pricing lookupFollow-up reasoning',
        'Here is what pricing shows.',
        'system_shell',
        'The main log file is application.log.',
      ])
    })
  })

  it('keeps the split follow-up activity above the related assistant text after streaming completes', async () => {
    const { container } = render(
      <MessageRenderer
        message={{
          id: 'message-2',
          role: 'assistant',
          content: `Initial response.${TOOL_FOLLOW_UP_SPLIT_MARKER}Follow-up response.`,
          timestamp: 1,
          thinkingBlocks: [
            {
              type: 'thinking',
              content: 'Initial reasoning',
              duration: 1000,
              timestamp: 1,
            },
            {
              type: 'thinking',
              content: 'Follow-up reasoning',
              duration: 800,
              timestamp: 2,
            },
            {
              type: 'tool',
              toolName: 'mcp__filesystem__read_file',
              timestamp: 3,
            },
          ],
          toolResults: [
            {
              toolCall: {
                id: 'tool-1',
                name: 'mcp__filesystem__read_file',
                arguments: { path: '/tmp/demo.txt' },
              },
              result: {
                success: true,
                data: { text: 'demo' },
              },
            },
          ],
        }}
        isStreaming={false}
        sessionId="session-1"
      />
    )

    await waitFor(() => {
      const sequence = Array.from(
        container.querySelectorAll('[data-testid="thinking-block"],[data-testid="markdown"]')
      ).map((node) => node.textContent)

      expect(sequence).toEqual([
        'Initial reasoning',
        'Initial response.',
        'Follow-up reasoningmcp__filesystem__read_file',
        'Follow-up response.',
      ])
    })
  })

  it('renders only one active connecting state when a persisted split marker is already present', async () => {
    const { container } = render(
      <MessageRenderer
        message={{
          id: 'message-3',
          role: 'assistant',
          content: `Initial response.${TOOL_FOLLOW_UP_SPLIT_MARKER}Follow-up response.`,
          timestamp: 1,
          thinking: 'Follow-up reasoning',
          thinkingBlocks: [
            {
              type: 'thinking',
              content: 'Initial reasoning',
              duration: 1000,
              timestamp: 1,
            },
            {
              type: 'thinking',
              content: 'Earlier follow-up reasoning',
              duration: 800,
              timestamp: 2,
            },
          ],
        }}
        isStreaming={true}
        streamPhase="reasoning"
      />
    )

    await waitFor(() => {
      const sequence = Array.from(
        container.querySelectorAll('[data-testid="thinking-block"],[data-testid="markdown"]')
      ).map((node) => node.textContent || '')

      expect(sequence).toEqual([
        'Initial reasoning',
        'Initial response.',
        'Earlier follow-up reasoningThinking...Follow-up reasoning',
        'Follow-up response.',
      ])
    })

    expect(screen.getAllByText('Thinking...')).toHaveLength(1)
  })

  it('passes parallel active search queries to the thinking block', async () => {
    render(
      <MessageRenderer
        message={{
          id: 'message-4',
          role: 'assistant',
          content: '',
          timestamp: 1,
          researchStatus: {
            currentRound: 1,
            maxRounds: 0,
            currentSearch: 'zura ai overview',
            currentSearches: ['zura ai overview', 'zura ai pricing', 'zura ai docs'],
            isSearching: true,
          },
        }}
        isStreaming={true}
        streamPhase="searching"
      />
    )

    await waitFor(() => {
      expect(
        screen.getByText('zura ai overview | zura ai pricing | zura ai docs')
      ).toBeInTheDocument()
    })
  })

  it('keeps completed tool blocks and active response text in the same thinking area while streaming', async () => {
    render(
      <MessageRenderer
        message={{
          id: 'message-streaming-code-tool',
          role: 'assistant',
          content: '',
          thinking: 'Preparing final response',
          timestamp: 1,
          thinkingBlocks: [
            {
              type: 'tool',
              toolName: 'code_execution',
              timestamp: 1,
            },
          ],
        }}
        isStreaming={true}
        streamPhase="answering"
      />
    )

    const thinkingBlocks = await screen.findAllByTestId('thinking-block')
    expect(thinkingBlocks).toHaveLength(1)
    expect(thinkingBlocks[0]).toHaveTextContent('Preparing final response')
  })

  it('does not render legacy active thinking when it duplicates a completed thinking block', async () => {
    render(
      <MessageRenderer
        message={{
          id: 'message-duplicate-thinking',
          role: 'assistant',
          content: '',
          thinking: 'The user is asking whether Triple T is the best person in the world.',
          timestamp: 1,
          thinkingBlocks: [
            {
              type: 'thinking',
              content: 'The user is asking whether Triple T is the best person in the world.',
              duration: 3000,
              timestamp: 1,
            },
          ],
        }}
        isStreaming={true}
        streamPhase="answering"
      />
    )

    const thinkingBlocks = await screen.findAllByTestId('thinking-block')
    const duplicatedText = 'The user is asking whether Triple T is the best person in the world.'
    expect(thinkingBlocks).toHaveLength(1)
    expect(thinkingBlocks[0]).toHaveTextContent(duplicatedText)
    expect((thinkingBlocks[0].textContent || '').split(duplicatedText)).toHaveLength(2)
  })

  it('does not render DeepSeek active thinking when it replays a completed thinking prefix', async () => {
    const completedThinking =
      'The text was pasted successfully into Notepad. The screenshot shows the Notepad window with a good amount of text. The text looks good - it is well-formatted and substantial. Let me confirm to the user that everything is done.'
    const replayedPrefix =
      'The text was pasted successfully into Notepad. The screenshot shows the Notepad window with a good amount of text. The text looks good - it is well-formatted and substantial. Let me confirm to the user that'

    render(
      <MessageRenderer
        message={{
          id: 'message-deepseek-prefix-duplicate-thinking',
          role: 'assistant',
          content: '',
          thinking: replayedPrefix,
          timestamp: 1,
          thinkingBlocks: [
            {
              type: 'thinking',
              content: completedThinking,
              duration: 1000,
              timestamp: 1,
            },
          ],
        }}
        isStreaming={true}
        streamPhase="answering"
      />
    )

    const thinkingBlocks = await screen.findAllByTestId('thinking-block')
    expect(thinkingBlocks).toHaveLength(1)
    expect(thinkingBlocks[0]).toHaveTextContent(completedThinking)
    expect(thinkingBlocks[0]).not.toHaveTextContent(`${completedThinking}${replayedPrefix}`)
    expect((thinkingBlocks[0].textContent || '').split(replayedPrefix)).toHaveLength(2)
  })
})

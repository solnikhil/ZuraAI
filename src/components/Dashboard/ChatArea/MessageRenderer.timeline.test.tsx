import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TOOL_FOLLOW_UP_SPLIT_MARKER } from './messageTimeline'

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

vi.mock('../../../tools/ui/ToolResultDisplay', () => ({
  default: ({ toolName }: { toolName: string }) => <div data-testid="tool-result">{toolName}</div>,
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
      rerender(
        <MessageRenderer message={baseMessage} isStreaming={true} streamPhase={phase} />
      )

      await waitFor(() => {
        const sequence = Array.from(
          container.querySelectorAll('[data-testid="thinking-block"],[data-testid="markdown"]')
        ).map((node) => node.getAttribute('data-testid'))

        expect(sequence).toEqual(['thinking-block', 'markdown'])
      })
    }
  })

  it('keeps streamed assistant text below work activity once answer content has started', async () => {
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
        streamPhase="answering"
      />
    )

    await waitFor(() => {
      expect(container.querySelectorAll('[data-testid="thinking-block"]')).toHaveLength(1)
    })

    rerender(
      <MessageRenderer
        message={{
          ...baseMessage,
          content: 'Initial response.Follow-up response.',
          thinking: 'Follow-up reasoning',
        }}
        isStreaming={true}
        streamPhase="answering"
      />
    )

    await waitFor(() => {
      const sequence = Array.from(
        container.querySelectorAll('[data-testid="thinking-block"],[data-testid="markdown"]')
      ).map((node) => node.textContent || '')

      expect(sequence).toHaveLength(2)
      expect(sequence[0]).toContain('Initial reasoning')
      expect(sequence[0]).toContain('Follow-up reasoning')
      expect(sequence[1]).toBe('Initial response.Follow-up response.')
    })
  })

  it('strips split markers without splitting the visible assistant text', async () => {
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
        'Initial reasoningFollow-up reasoningmcp__filesystem__read_file',
        'Initial response.Follow-up response.',
      ])
    })
  })

  it('renders one active connecting state when a persisted split marker is already present', async () => {
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
        streamPhase="answering"
      />
    )

    await waitFor(() => {
      expect(container.querySelectorAll('[data-testid="thinking-block"]')).toHaveLength(1)
    })

    expect(container).toHaveTextContent('Initial reasoning')
    expect(container).toHaveTextContent('Follow-up reasoning')

    const sequence = Array.from(
      container.querySelectorAll('[data-testid="thinking-block"],[data-testid="markdown"]')
    )
    expect(sequence[0]).toHaveAttribute('data-testid', 'thinking-block')
    if (sequence.length > 1) {
      expect(sequence[1]).toHaveAttribute('data-testid', 'markdown')
      expect(sequence[1]).toHaveTextContent('Initial response.Follow-up response.')
    }
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
      expect(screen.getByText('zura ai overview | zura ai pricing | zura ai docs')).toBeInTheDocument()
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
    expect(thinkingBlocks[0]).toHaveTextContent('code_execution')
    expect(thinkingBlocks[0]).toHaveTextContent('Preparing final response')
  })
})

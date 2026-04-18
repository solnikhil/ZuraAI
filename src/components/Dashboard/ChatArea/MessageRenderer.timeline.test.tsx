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
      {isThinking ? <span>Connecting</span> : null}
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

  it('renders follow-up thinking below the existing streamed content', async () => {
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

  it('keeps the split follow-up thought below the tool card after streaming completes', async () => {
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
      expect(container.querySelectorAll('[data-testid="thinking-block"]')).toHaveLength(2)
    })

    expect(container).toHaveTextContent('Initial reasoning')
    expect(screen.getAllByText('Connecting')).toHaveLength(1)
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

  it('hides completed code_execution thinking blocks while streaming', async () => {
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
    expect(thinkingBlocks[0]).not.toHaveTextContent('code_execution')
  })
})

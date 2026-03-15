import { render, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it, vi } from 'vitest'
import { TOOL_FOLLOW_UP_SPLIT_MARKER } from './messageTimeline'

vi.mock('../../../contexts/SettingsContext', () => ({
  useSettings: () => ({
    settings: {
      aiModel: 'test-model',
      chatBubbleStyle: 'solid',
    },
  }),
}))

vi.mock('../../LazyMarkdown', () => ({
  default: ({ content }: { content: string }) => <div data-testid="markdown">{content}</div>,
}))

vi.mock('../../ThinkingBlock', () => ({
  default: ({
    thinking,
    completedBlocks,
  }: {
    thinking?: string
    completedBlocks?: Array<{ content?: string; query?: string }>
  }) => (
    <div data-testid="thinking-block">
      {completedBlocks?.map((block, index) => (
        <span key={index}>{block.content || block.query}</span>
      ))}
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
      ).map((node) => node.textContent)

      expect(sequence).toEqual([
        'Initial reasoning',
        'Initial response.',
        'Follow-up reasoning',
        'Follow-up response.',
      ])
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
          ],
          toolResults: [
            {
              toolCall: {
                id: 'tool-1',
                name: 'research_plan',
                arguments: {},
              },
              result: {
                success: true,
                data: { combinedResults: '# Research\n- Result' },
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
        container.querySelectorAll('[data-testid="thinking-block"],[data-testid="markdown"],[data-testid="tool-result"]')
      ).map((node) => node.textContent)

      expect(sequence).toEqual([
        'Initial reasoning',
        'Initial response.',
        'research_plan',
        'Follow-up reasoning',
        'Follow-up response.',
      ])
    })
  })
})

import { act, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StreamingProvider, useStreamingActions } from '../../../contexts/StreamingContext'
import StreamingMessage from './StreamingMessage'

vi.mock('../../../contexts/SettingsContext', () => ({
  useSettings: () => ({
    settings: {
      aiModel: 'test-model',
      chatBubbleStyle: 'solid',
      webSearchIncludeImages: false,
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
    completedBlocks,
    activeToolCalls,
  }: {
    thinking?: string
    isThinking?: boolean
    completedBlocks?: Array<{ content?: string; toolName?: string }>
    activeToolCalls?: Array<{ name: string }>
  }) => (
    <div data-testid="thinking-block">
      {completedBlocks?.map((block, index) => (
        <span key={index}>{block.content || block.toolName}</span>
      ))}
      {isThinking ? <span>Thinking...</span> : null}
      {activeToolCalls?.length ? <span>Tool Active</span> : null}
      {thinking ? <span>{thinking}</span> : null}
    </div>
  ),
}))

vi.mock('../../ResponseInfo', () => ({
  default: () => null,
}))

vi.mock('../../../tools/ui/ToolResultDisplay', () => ({
  default: () => null,
}))

vi.mock('./MessageRenderer/attachmentUtils', () => ({
  formatFileSize: () => '1 KB',
}))

function getTimelineSequence(root: HTMLElement): string[] {
  return Array.from(
    root.querySelectorAll('[data-testid="thinking-block"],[data-testid="markdown"]')
  ).map((node) => node.getAttribute('data-testid') || '')
}

type StreamingReplayStep = Parameters<ReturnType<typeof useStreamingActions>['updateStreaming']>[0]

function StreamingReplayHarness({ steps }: { steps: StreamingReplayStep[] }) {
  const { startStreaming, updateStreaming } = useStreamingActions()
  const baseMessage = {
    id: 'message-stream-replay',
    role: 'assistant' as const,
    content: '',
    timestamp: 1,
  }

  useEffect(() => {
    startStreaming('session-replay', baseMessage.id)
    for (const step of steps) {
      updateStreaming(step)
    }
  }, [startStreaming, steps, updateStreaming])

  return (
    <div data-testid="replay-root">
      <StreamingMessage message={baseMessage} sessionId="session-replay" />
    </div>
  )
}

describe('StreamingMessage streaming layout replay', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('interleaves follow-up thinking below the first answer segment during tool replay', async () => {
    const steps: StreamingReplayStep[] = [
      { phase: 'reasoning', thinking: 'Initial reasoning' },
      {
        phase: 'answering',
        thinking: undefined,
        thinkingDuration: undefined,
        thinkingBlocks: [
          {
            type: 'thinking',
            content: 'Initial reasoning',
            duration: 1000,
            timestamp: 1,
          },
        ],
        content: 'Preamble before tools.',
      },
      {
        phase: 'tool',
        content: 'Preamble before tools.',
        thinking: 'Follow-up reasoning',
      },
    ]

    await act(async () => {
      render(
        <StreamingProvider>
          <StreamingReplayHarness steps={steps} />
        </StreamingProvider>
      )
    })

    await waitFor(() => {
      const sequence = getTimelineSequence(screen.getByTestId('replay-root'))
      expect(sequence).toEqual(['thinking-block', 'markdown', 'thinking-block'])
    })
  })

  it('keeps the first answer segment fixed when follow-up reasoning starts', async () => {
    const steps: StreamingReplayStep[] = [
      { phase: 'reasoning', thinking: 'Planning the response...' },
      {
        phase: 'answering',
        thinking: undefined,
        thinkingDuration: undefined,
        thinkingBlocks: [
          {
            type: 'thinking',
            content: 'Planning the response...',
            duration: 800,
            timestamp: 1,
          },
        ],
        content: 'Here is the start of the answer.',
      },
      {
        phase: 'reasoning',
        thinking: 'Follow-up reasoning after partial answer',
        content: 'Here is the start of the answer.',
      },
    ]

    await act(async () => {
      render(
        <StreamingProvider>
          <StreamingReplayHarness steps={steps} />
        </StreamingProvider>
      )
    })

    await waitFor(() => {
      const root = screen.getByTestId('replay-root')
      const sequence = getTimelineSequence(root)
      expect(sequence).toEqual(['thinking-block', 'markdown', 'thinking-block'])

      const markdown = root.querySelector('[data-testid="markdown"]')
      expect(markdown).toHaveTextContent('Here is the start of the answer.')
    })
  })

  it('renders active tool calls below answer text when tool phase has preamble content', async () => {
    const baseMessage = {
      id: 'message-tool-active',
      role: 'assistant' as const,
      content: '',
      timestamp: 1,
      thinkingBlocks: [
        {
          type: 'thinking' as const,
          content: 'Completed reasoning',
          duration: 900,
          timestamp: 1,
        },
      ],
    }

    function ActiveToolHarness() {
      const { startStreaming, updateStreaming } = useStreamingActions()

      useEffect(() => {
        startStreaming('session-active-tool', baseMessage.id)
        updateStreaming({
          phase: 'tool',
          content: 'Answer text during tool phase.',
          thinkingBlocks: baseMessage.thinkingBlocks,
        })
      }, [startStreaming, updateStreaming])

      return (
        <div data-testid="active-tool-root">
          <StreamingMessage
            message={baseMessage}
            sessionId="session-active-tool"
            activeToolCalls={[{ name: 'system_shell', arguments: { command: 'ls' } }]}
          />
        </div>
      )
    }

    await act(async () => {
      render(
        <StreamingProvider>
          <ActiveToolHarness />
        </StreamingProvider>
      )
    })

    await waitFor(() => {
      const root = screen.getByTestId('active-tool-root')
      const sequence = getTimelineSequence(root)
      expect(sequence).toEqual(['thinking-block', 'markdown', 'thinking-block'])
      expect(screen.getByText('Tool Active')).toBeInTheDocument()
    })
  })

  it('keeps markdown below thinking when streamPhase is tool with merged non-empty content', async () => {
    const baseMessage = {
      id: 'message-tool-phase',
      role: 'assistant' as const,
      content: '',
      timestamp: 1,
      thinkingBlocks: [
        {
          type: 'thinking' as const,
          content: 'Completed reasoning',
          duration: 900,
          timestamp: 1,
        },
      ],
    }

    function ToolPhaseHarness() {
      const { startStreaming, updateStreaming } = useStreamingActions()

      useEffect(() => {
        startStreaming('session-tool', baseMessage.id)
        updateStreaming({
          phase: 'tool',
          content: 'Answer text during tool phase.',
          thinkingBlocks: baseMessage.thinkingBlocks,
        })
      }, [startStreaming, updateStreaming])

      return (
        <div data-testid="tool-phase-root">
          <StreamingMessage message={baseMessage} sessionId="session-tool" />
        </div>
      )
    }

    await act(async () => {
      render(
        <StreamingProvider>
          <ToolPhaseHarness />
        </StreamingProvider>
      )
    })

    await waitFor(() => {
      const sequence = getTimelineSequence(screen.getByTestId('tool-phase-root'))
      expect(sequence).toEqual(['thinking-block', 'markdown'])
    })
  })
})

import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import ThinkingBlock from './ThinkingBlock'

describe('ThinkingBlock behavior', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows follow-up reasoning in a new block for the same message', async () => {
    const { rerender } = render(
      <ThinkingBlock
        messageId="message-1"
        activeBlockKey="message-1:0:reasoning"
        thinking="Initial reasoning"
        isThinking={true}
        completedBlocks={[]}
      />
    )

    expect(await screen.findByText('Initial reasoning')).toBeInTheDocument()

    rerender(
      <ThinkingBlock
        messageId="message-1"
        activeBlockKey="message-1:1:searching"
        thinking=""
        isSearching={true}
        completedBlocks={[
          {
            type: 'thinking',
            content: 'Initial reasoning',
            duration: 1000,
            timestamp: 1,
          },
          {
            type: 'searching',
            query: 'follow up query',
            timestamp: 2,
          },
        ]}
      />
    )

    expect(await screen.findByText('Thought for 1s')).toBeInTheDocument()

    rerender(
      <ThinkingBlock
        messageId="message-1"
        activeBlockKey="message-1:1:reasoning"
        thinking="Follow-up reasoning"
        isThinking={true}
        completedBlocks={[
          {
            type: 'thinking',
            content: 'Initial reasoning',
            duration: 1000,
            timestamp: 1,
          },
          {
            type: 'searching',
            query: 'follow up query',
            timestamp: 2,
          },
        ]}
      />
    )

    expect(await screen.findByText(/Follow-up reasoning/)).toBeInTheDocument()
  })

  it('resets the live timer when the active block changes mid-stream', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-14T12:00:00.000Z'))

    const { rerender } = render(
      <ThinkingBlock
        messageId="message-1"
        activeBlockKey="message-1:0:reasoning"
        thinking="Initial reasoning"
        isThinking={true}
        completedBlocks={[]}
      />
    )

    rerender(
      <ThinkingBlock
        messageId="message-1"
        activeBlockKey="message-1:1:reasoning"
        thinking="Follow-up reasoning"
        isThinking={true}
        completedBlocks={[]}
      />
    )

    act(() => {
      vi.advanceTimersByTime(100)
    })

    expect(screen.getByText('Connecting')).toBeInTheDocument()
    expect(screen.queryByText(/Thinking for 1\d{9}/)).not.toBeInTheDocument()
  })

  it('expands the latest completed thought when no active block remains', async () => {
    const { container } = render(
      <ThinkingBlock
        messageId="message-1"
        activeBlockKey="message-1:2:answering"
        thinking=""
        completedBlocks={[
          {
            type: 'thinking',
            content: 'Earlier reasoning',
            duration: 3000,
            timestamp: 1,
          },
          {
            type: 'thinking',
            content: 'Follow-up reasoning',
            duration: 300,
            timestamp: 2,
          },
        ]}
      />
    )

    expect(await screen.findByText('Follow-up reasoning')).toBeInTheDocument()
    expect(screen.getByText('Thought for <1s')).toBeInTheDocument()
    expect(container.querySelector('.thinking-block.completed.expanded')).not.toBeNull()
  })
})

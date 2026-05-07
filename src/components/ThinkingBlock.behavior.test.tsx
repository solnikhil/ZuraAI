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

  it('keeps completed thoughts collapsed when no active block remains', async () => {
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

    expect(await screen.findByText('Thought for <1s')).toBeInTheDocument()
    expect(screen.queryByText('Follow-up reasoning')).not.toBeInTheDocument()
    expect(screen.getByText('Thought for <1s')).toBeInTheDocument()
    expect(container.querySelector('.thinking-block.completed .thinking-content')).toBeNull()
  })

  it('shows generic MCP tool activity copy for non-search tool calls', async () => {
    render(
      <ThinkingBlock
        messageId="message-2"
        activeBlockKey="message-2:0:tool"
        thinking=""
        activeToolCalls={[
          {
            name: 'mcp__filesystem__read_file',
            arguments: { path: '/tmp/demo.txt' },
          },
        ]}
      />
    )

    expect(
      await screen.findByText('Running Tool: Filesystem - read_file: /tmp/demo.txt')
    ).toBeInTheDocument()
  })

  it('shows additional active MCP tool calls when multiple tools are running', async () => {
    render(
      <ThinkingBlock
        messageId="message-3"
        activeBlockKey="message-3:0:tool"
        thinking=""
        activeToolCalls={[
          {
            name: 'mcp__filesystem__read_file',
            arguments: { path: '/tmp/demo.txt' },
          },
          {
            name: 'mcp__github__create_issue',
            arguments: { title: 'Follow-up task' },
          },
        ]}
      />
    )

    expect(
      await screen.findByText('Running Tool: Filesystem - read_file: /tmp/demo.txt (+1 more)')
    ).toBeInTheDocument()
    expect(
      screen.getByText('2. Running Tool: Github - create_issue: Follow-up task')
    ).toBeInTheDocument()
  })

  it('shows batched web searches simultaneously while they are running', async () => {
    render(
      <ThinkingBlock
        messageId="message-3b"
        activeBlockKey="message-3b:0:tool"
        thinking=""
        activeToolCalls={[
          {
            name: 'web_search',
            arguments: { query: 'openai responses api pricing' },
          },
          {
            name: 'web_search',
            arguments: { query: 'openai responses api rate limits' },
          },
        ]}
      />
    )

    expect(
      await screen.findByText('Searching web')
    ).toBeInTheDocument()
    expect(
      screen.getByText('1. Searching web: "openai responses api pricing"')
    ).toBeInTheDocument()
    expect(
      screen.getByText('2. Searching web: "openai responses api rate limits"')
    ).toBeInTheDocument()
  })

  it('shows completed batched search queries together in the active search state', async () => {
    render(
      <ThinkingBlock
        messageId="message-3c"
        activeBlockKey="message-3c:1:searching"
        thinking=""
        isSearching={true}
        searchQueries={[
          'electron app updater release notes',
          'electron app updater windows installer behavior',
        ]}
      />
    )

    expect(
      await screen.findByText('Searching web: "electron app updater release notes"')
    ).toBeInTheDocument()
    expect(
      screen.getByText('1. Searching web: "electron app updater release notes"')
    ).toBeInTheDocument()
    expect(
      screen.getByText('2. Searching web: "electron app updater windows installer behavior"')
    ).toBeInTheDocument()
  })

  it('renders completed MCP tool blocks with the same inline timeline treatment', async () => {
    render(
      <ThinkingBlock
        messageId="message-4"
        activeBlockKey="message-4:0:answering"
        thinking=""
        completedBlocks={[
          {
            type: 'tool',
            toolName: 'mcp__filesystem__read_file',
            timestamp: 1,
            toolInput: { path: '/tmp/demo.txt' },
            toolOutput: {
              success: true,
              data: { text: 'demo' },
              executionTime: 42,
              metadata: {
                origin: 'mcp',
                serverId: 'filesystem',
                serverName: 'Filesystem',
                namespacedToolName: 'mcp__filesystem__read_file',
                originalToolName: 'read_file',
                trusted: true,
                approvalState: 'approved',
                durationMs: 42,
                outcome: 'success',
              },
            },
          },
        ]}
      />
    )

    expect(await screen.findByText('Tool: Filesystem - read_file: /tmp/demo.txt')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
  })
})

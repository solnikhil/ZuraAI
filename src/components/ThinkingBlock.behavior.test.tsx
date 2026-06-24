import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ThinkingBlock, { normalizeThinkingContentForDisplay } from './ThinkingBlock'

describe('ThinkingBlock behavior', () => {
  beforeEach(() => {
    window.scrollTo = vi.fn()
  })

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

  it('shows initial Thinking... state before the streaming layer reports a reasoning duration', () => {
    render(
      <ThinkingBlock
        messageId="message-1"
        activeBlockKey="message-1:0:reasoning"
        thinking="Initial reasoning"
        isThinking={true}
        completedBlocks={[]}
      />
    )

    expect(screen.getByText('Thinking...')).toBeInTheDocument()
    expect(screen.queryByText(/Thinking for/)).not.toBeInTheDocument()
  })

  it('shows active reasoning duration from props instead of owning a local timer', () => {
    vi.useFakeTimers()
    render(
      <ThinkingBlock
        messageId="message-2"
        activeBlockKey="message-2:0:reasoning"
        thinking="Follow-up reasoning"
        isThinking={true}
        thinkingDuration={1250}
        completedBlocks={[]}
      />
    )

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(screen.getByText('Thinking for 1.3 seconds')).toBeInTheDocument()
    expect(screen.queryByText(/Thinking for 6/)).not.toBeInTheDocument()
  })

  it('does not show or advance a thinking timer during search and tool activity', () => {
    vi.useFakeTimers()
    const { rerender } = render(
      <ThinkingBlock
        messageId="message-2b"
        activeBlockKey="message-2b:0:searching"
        thinking=""
        isSearching={true}
        searchQuery="zura ai"
      />
    )

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(screen.getByText('Sourcing “zura ai”')).toBeInTheDocument()
    expect(screen.queryByText(/Thinking for/)).not.toBeInTheDocument()

    rerender(
      <ThinkingBlock
        messageId="message-2b"
        activeBlockKey="message-2b:1:tool"
        thinking=""
        activeToolCalls={[
          {
            name: 'mcp__filesystem__read_file',
            arguments: { path: '/tmp/demo.txt' },
          },
        ]}
      />
    )

    act(() => {
      vi.advanceTimersByTime(250)
    })

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(screen.getByText('Running Tool: Filesystem - read_file: /tmp/demo.txt')).toBeInTheDocument()
    expect(screen.queryByText(/Thinking for/)).not.toBeInTheDocument()
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

  it('normalizes provider reasoning that streams one short token per line', () => {
    expect(normalizeThinkingContentForDisplay('Need\n search\n variants\n.')).toBe(
      'Need search variants.'
    )
  })

  it('normalizes subword-tokenized provider reasoning without adding spaces inside words', () => {
    const normalized = normalizeThinkingContentForDisplay(
      'We\n have\n official\n H\nF\n and\n Open\nRouter\n.\n Need\n maybe\n answer\n with\n caveat\n "\nyes\n,\n if\n using\n Open\nRouter\n,\n it\n supports\n reasoning\n and\n you\n can\n enable\n via\n `\nreason\ning\n`\n parameter\n.\n"\n Could\n mention\n "\nN\n2\n Pro\n is\n an\n ag\nentic\n model\n,\n supports\n reasoning\n.\n"'
    )

    expect(normalized).toContain('We have official HF and Open Router.')
    expect(normalized).toContain('via `reasoning` parameter')
    expect(normalized).toContain('N2 Pro is an agentic model')
  })

  it('preserves structured multiline reasoning while normalizing display text', () => {
    expect(normalizeThinkingContentForDisplay('- Search docs\n- Check provider\n- Answer')).toBe(
      '- Search docs\n- Check provider\n- Answer'
    )
  })

  it('renders short token-per-line completed reasoning as a sentence when expanded', async () => {
    const { container } = render(
      <ThinkingBlock
        messageId="message-token-lines"
        activeBlockKey="message-token-lines:1:answering"
        thinking=""
        completedBlocks={[
          {
            type: 'thinking',
            content: 'Need\n search\n variants\n.',
            duration: 300,
            timestamp: 1,
          },
        ]}
      />
    )

    fireEvent.click(container.querySelector('.thinking-header.completed') as HTMLElement)
    expect(await screen.findByText('Need search variants.')).toBeInTheDocument()
    expect(screen.queryByText('Need search variants .')).not.toBeInTheDocument()
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

    expect(screen.getByText(/openai responses api pricing/)).toBeInTheDocument()
    expect(screen.getByText(/openai responses api rate limits/)).toBeInTheDocument()
    expect(screen.queryByText('Sourcing the web')).not.toBeInTheDocument()
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

    expect(screen.getByText(/electron app updater release notes/)).toBeInTheDocument()
    expect(screen.getByText(/electron app updater windows installer behavior/)).toBeInTheDocument()
    expect(screen.queryByText('Sourcing the web')).not.toBeInTheDocument()
  })

  it('does not let stale search queries override the thinking title after search finishes', async () => {
    render(
      <ThinkingBlock
        messageId="message-3d"
        activeBlockKey="message-3d:2:reasoning"
        thinking="Synthesizing the search results into an answer."
        thinkingDuration={9000}
        isSearching={false}
        searchQueries={[
          '2026 FIFA World Cup schedule',
          'latest Mars rover discoveries 2026',
          'top programming languages 2026',
          'global EV sales Q1 2026',
        ]}
      />
    )

    expect(screen.getByText('Thought for 9.0 seconds')).toBeInTheDocument()
    expect(screen.queryByText('Sourcing the web · 4 queries')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Thought for 9.0 seconds'))
    expect(screen.getByText('Synthesizing the search results into an answer.')).toBeInTheDocument()
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

  it('renders system_shell tool output as a Codex-style terminal panel', async () => {
    const { container } = render(
      <ThinkingBlock
        messageId="message-shell"
        activeBlockKey="message-shell:0:answering"
        thinking=""
        completedBlocks={[
          {
            type: 'tool',
            toolName: 'system_shell',
            timestamp: 1,
            toolInput: { command: 'Get-Date', description: 'Get the current date' },
            toolOutput: {
              success: true,
              data: {
                command: 'Get-Date',
                cwd: 'C:/work',
                stdout: '\u001b[32mSaturday\u001b[0m',
                stderr: '',
                exitCode: 0,
              },
              executionTime: 12,
            },
          },
        ]}
      />
    )

    const header = container.querySelector('.thinking-header.tool-call') as HTMLElement
    expect(header).toBeTruthy()
    // Codex-style "Ran a command" header with a green success blob.
    expect(screen.getByText('Ran a command')).toBeInTheDocument()
    expect(container.querySelector('.thinking-cmd-blob--success')).toBeTruthy()
    fireEvent.click(header)

    // Terminal panel chrome + command + ANSI-stripped output + success badge.
    expect(await screen.findByText('Shell')).toBeInTheDocument()
    expect(screen.getByText('Get-Date')).toBeInTheDocument()
    expect(screen.getByText('Saturday')).toBeInTheDocument()
    expect(screen.getByText('✓ Success')).toBeInTheDocument()
    // It must NOT render the raw JSON Input/Output labels for this tool.
    expect(screen.queryByText('Input')).not.toBeInTheDocument()
  })

  it('groups consecutive system_shell calls into a single "Ran N commands" entry', async () => {
    const makeShell = (ts: number, cmd: string, exitCode = 0) => ({
      type: 'tool' as const,
      toolName: 'system_shell',
      timestamp: ts,
      toolInput: { command: cmd },
      toolOutput: {
        success: exitCode === 0,
        data: { command: cmd, cwd: 'C:/work', stdout: `out-${cmd}`, stderr: '', exitCode },
        executionTime: 10,
      },
    })

    const { container } = render(
      <ThinkingBlock
        messageId="message-batch"
        activeBlockKey="message-batch:0:answering"
        thinking=""
        completedBlocks={[
          makeShell(1, 'cmd-a'),
          makeShell(2, 'cmd-b'),
          makeShell(3, 'cmd-c', 1),
        ]}
      />
    )

    // One grouped header, pluralized, with an error blob (one command failed).
    expect(screen.getByText('Ran 3 commands')).toBeInTheDocument()
    expect(screen.queryByText('Ran a command')).not.toBeInTheDocument()
    expect(container.querySelector('.thinking-cmd-blob--error')).toBeTruthy()

    // Expanding the group reveals the command-name rows — not the panels yet.
    fireEvent.click(container.querySelector('.thinking-header.tool-call') as HTMLElement)
    expect(await screen.findByText('cmd-a')).toBeInTheDocument()
    expect(screen.getByText('cmd-b')).toBeInTheDocument()
    expect(screen.getByText('cmd-c')).toBeInTheDocument()
    expect(screen.queryByText('Shell')).not.toBeInTheDocument()

    // Expanding a single command row reveals just that command's terminal.
    fireEvent.click(screen.getByText('cmd-a'))
    expect((await screen.findAllByText('Shell')).length).toBe(1)
  })
})

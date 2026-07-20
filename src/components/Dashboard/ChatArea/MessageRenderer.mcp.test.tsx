import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it, vi } from 'vitest'

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
    completedBlocks,
  }: {
    completedBlocks?: Array<{ content?: string; query?: string; toolName?: string }>
  }) => (
    <div data-testid="thinking-block">
      {completedBlocks?.map((block, index) => (
        <span key={index}>{block.content || block.query || block.toolName}</span>
      ))}
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

describe('MessageRenderer MCP timeline', () => {
  it('renders MCP tool history inline in the thinking timeline', () => {
    render(
      <MessageRenderer
        message={{
          id: 'message-mcp-1',
          role: 'assistant',
          content: 'Done.',
          timestamp: 1,
          thinkingBlocks: [
            {
              type: 'tool',
              toolName: 'mcp__filesystem__read_file',
              timestamp: 1,
              toolInput: { path: '/tmp/demo.txt' },
              toolOutput: {
                success: true,
                data: { text: 'hello' },
              },
            },
            {
              type: 'tool',
              toolName: 'mcp__github__create_issue',
              timestamp: 2,
              toolInput: { title: 'Needs review' },
              toolOutput: {
                success: false,
                error: 'Approval rejected by user',
              },
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
                data: { text: 'hello' },
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
            {
              toolCall: {
                id: 'tool-2',
                name: 'mcp__github__create_issue',
                arguments: { title: 'Needs review' },
              },
              result: {
                success: false,
                error: 'Approval rejected by user',
                metadata: {
                  origin: 'mcp',
                  serverId: 'github',
                  serverName: 'GitHub',
                  namespacedToolName: 'mcp__github__create_issue',
                  originalToolName: 'create_issue',
                  trusted: true,
                  approvalState: 'rejected',
                  durationMs: 3,
                  outcome: 'rejected',
                },
              },
            },
          ],
        }}
        isStreaming={false}
        sessionId="session-1"
      />
    )

    expect(screen.getByText('mcp__filesystem__read_file')).toBeInTheDocument()
    expect(screen.getByText('mcp__github__create_issue')).toBeInTheDocument()
  })

  it('renders MCP timeline history when persisted metadata omits the explicit origin flag', () => {
    render(
      <MessageRenderer
        message={{
          id: 'message-mcp-legacy-shape',
          role: 'assistant',
          content: 'Done.',
          timestamp: 1,
          thinkingBlocks: [
            {
              type: 'tool',
              toolName: 'mcp__seqthnk__sequentialthinking',
              timestamp: 1,
              toolInput: { thought: 'plan this' },
              toolOutput: {
                success: true,
                data: { nextThoughtNeeded: true },
              },
            },
          ],
          toolResults: [
            {
              toolCall: {
                id: 'tool-1',
                name: 'sequentialthinking',
                arguments: { thought: 'plan this' },
              },
              result: {
                success: true,
                data: { nextThoughtNeeded: true },
                metadata: {
                  serverId: 'seqthnk',
                  serverName: 'seqthnk',
                  namespacedToolName: 'mcp__seqthnk__sequentialthinking',
                  originalToolName: 'sequentialthinking',
                  trusted: true,
                  approvalState: 'approved',
                  durationMs: 42,
                  outcome: 'success',
                },
              },
            },
          ],
        }}
        isStreaming={false}
        sessionId="session-1"
      />
    )

    expect(screen.getByText('mcp__seqthnk__sequentialthinking')).toBeInTheDocument()
  })
})

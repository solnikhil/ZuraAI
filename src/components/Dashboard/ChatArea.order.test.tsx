import { render } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../contexts/SettingsContext', () => ({
  useSettings: () => ({
    settings: {
      aiModel: 'test-model',
      chatBubbleStyle: 'solid',
    },
  }),
}))

vi.mock('../LazyMarkdown', () => ({
  default: ({ content }: { content: string }) => <div data-testid="markdown">{content}</div>,
}))

vi.mock('../ThinkingBlock', () => ({
  default: () => <div data-testid="thinking-block" />,
}))

vi.mock('../ResponseInfo', () => ({
  default: () => null,
}))

vi.mock('../../tools/ui/ToolResultDisplay', () => ({
  default: ({ toolName }: { toolName: string }) => (
    <div data-testid="tool-result-display">{toolName}</div>
  ),
}))

vi.mock('@/components/shared/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('./ChatArea/attachmentUtils', () => ({
  formatFileSize: () => '1 KB',
}))

import { MessageRenderer } from './ChatArea/MessageRenderer'

describe('MessageRenderer tool result ordering', () => {
  it('renders tool cards before the action row', () => {
    const { container } = render(
      <MessageRenderer
        message={{
          id: 'assistant-1',
          role: 'assistant',
          content: 'I drafted a proposal.',
          timestamp: 1,
          toolResults: [
            {
              toolCall: {
                id: 'tool-1',
                name: 'research_plan',
                arguments: { topic: 'test topic', steps: [{ stepNumber: 1, query: 'test query' }] },
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
        onRegenerate={vi.fn()}
      />
    )

    const markdown = container.querySelector('[data-testid="markdown"]')
    const toolResult = container.querySelector('[data-testid="tool-result-display"]')
    const actionRowButton = container.querySelector('button[title="Regenerate with custom instructions"]')

    expect(markdown).not.toBeNull()
    expect(toolResult).not.toBeNull()
    expect(actionRowButton).not.toBeNull()
    expect(markdown?.compareDocumentPosition(toolResult as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(toolResult?.compareDocumentPosition(actionRowButton as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    )
  })
})

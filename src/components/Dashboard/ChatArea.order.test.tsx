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

vi.mock('@/components/shared/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('./ChatArea/attachmentUtils', () => ({
  formatFileSize: () => '1 KB',
}))

import { MessageRenderer } from './ChatArea/MessageRenderer'

describe('MessageRenderer tool result surface', () => {
  it('does not render post-message tool result cards', () => {
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
                name: 'local_helper',
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
        onRegenerate={vi.fn()}
      />
    )

    const markdown = container.querySelector('[data-testid="markdown"]')
    const toolResult = container.querySelector('[data-testid="tool-result-display"]')
    const actionRowButton = container.querySelector(
      'button[aria-label="Regenerate with custom instructions"]'
    )

    expect(markdown).not.toBeNull()
    expect(toolResult).toBeNull()
    expect(actionRowButton).not.toBeNull()
    expect(markdown?.compareDocumentPosition(actionRowButton as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    )
  })
})

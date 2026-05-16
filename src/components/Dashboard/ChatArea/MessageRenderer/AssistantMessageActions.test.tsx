import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it, vi } from 'vitest'

import { AssistantMessageActions } from './AssistantMessageActions'

describe('AssistantMessageActions', () => {
  it('shows cache telemetry in the response details popover', async () => {
    render(
      <AssistantMessageActions
        totalVersions={0}
        displayVersionIndex={0}
        onNavigateVersion={vi.fn()}
        hasDisplayContent
        copied={false}
        onCopy={vi.fn()}
        shouldShowInfoTooltip
        responseInfoData={{
          defaultModel: 'test-model',
          usage: {
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
            cachedInputTokens: 40,
            cacheMissInputTokens: 20,
            cacheWriteInputTokens: 10,
            cachedOutputTokens: 5,
          },
        }}
        messageActionButtonClassName="message-action-button"
      />
    )

    fireEvent.mouseEnter(screen.getByLabelText('Response details'))

    await waitFor(() => {
      expect(screen.getByText('Cache hit input')).toBeInTheDocument()
      expect(screen.getByText('Cache miss input')).toBeInTheDocument()
      expect(screen.getByText('Cache write input')).toBeInTheDocument()
      expect(screen.getByText('Cached output')).toBeInTheDocument()
    })
  })
})

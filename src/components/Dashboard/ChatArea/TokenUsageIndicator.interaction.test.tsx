import { act, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockChatHistory = {
  sessions: [],
  currentSessionId: null,
}

const mockStreamingState = {
  isStreaming: false,
  sessionId: null,
  messageId: null,
  content: '',
}

const mockSettings = {
  settings: {
    systemPrompt: '',
    maxTokens: 1000,
  },
}

const mockModelSelector = {
  currentModel: {
    displayName: 'Test Model',
    maxContext: 8192,
  },
  currentName: 'Test Model',
  allModels: [],
}

const openSelector = vi.fn()

vi.mock('../../../contexts/ChatHistoryContext', () => ({
  useChatHistory: () => mockChatHistory,
}))

vi.mock('../../../contexts/StreamingContext', () => ({
  useStreamingState: () => mockStreamingState,
}))

vi.mock('../../../contexts/SettingsContext', () => ({
  useSettings: () => mockSettings,
}))

vi.mock('../ModelSelector/useModelSelector', () => ({
  useModelSelector: () => mockModelSelector,
}))

vi.mock('../../../contexts/ModelSelectorContext', () => ({
  useModelSelectorContext: () => ({ openSelector }),
}))

import { TokenUsageIndicator } from './TokenUsageIndicator'

describe('TokenUsageIndicator interactions', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    openSelector.mockClear()
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('opens on hover delay and closes on mouse leave when not pinned', () => {
    render(<TokenUsageIndicator input="" />)

    const trigger = screen.getByRole('button')

    expect(screen.queryByText('Context Details')).not.toBeInTheDocument()

    fireEvent.mouseEnter(trigger)
    act(() => {
      vi.advanceTimersByTime(199)
    })
    expect(screen.queryByText('Context Details')).not.toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.getByText('Context Control')).toBeInTheDocument()

    fireEvent.mouseLeave(trigger)
    act(() => {
      vi.advanceTimersByTime(149)
    })
    expect(screen.getByText('Context Control')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.queryByText('Context Control')).not.toBeInTheDocument()
  })

  it('supports hover preview + click pin toggle without conflicts', () => {
    render(<TokenUsageIndicator input="" />)

    const trigger = screen.getByRole('button')

    fireEvent.mouseEnter(trigger)
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(screen.getByText('Context Control')).toBeInTheDocument()

    fireEvent.click(trigger)
    fireEvent.mouseLeave(trigger)

    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(screen.getByText('Context Control')).toBeInTheDocument()

    fireEvent.click(trigger)
    expect(screen.queryByText('Context Control')).not.toBeInTheDocument()
  })

  it('shows action controls and opens model selector through the shared request context', () => {
    render(<TokenUsageIndicator input="" />)

    fireEvent.click(screen.getByRole('button'))

    expect(screen.getByText('Model')).toBeInTheDocument()
    expect(screen.queryByText('Trim')).not.toBeInTheDocument()
    expect(screen.queryByText('Report')).not.toBeInTheDocument()
    expect(screen.queryByText('Healthy')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Model'))
    expect(openSelector).toHaveBeenCalledTimes(1)
  })

  it('counts text attachment context in the popover', () => {
    const textFile = {
      id: 'file-1',
      name: 'notes.txt',
      type: 'file' as const,
      size: 5,
      data: 'data:text/plain;base64,aGVsbG8gd29ybGQ=',
      mimeType: 'text/plain',
    }

    render(<TokenUsageIndicator input="" attachedFiles={[textFile]} />)

    fireEvent.click(screen.getByRole('button'))

    expect(screen.getByText('Text Attachments')).toBeInTheDocument()
  })
})

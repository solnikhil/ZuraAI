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
  },
}

const mockModelSelector = {
  currentModel: {
    maxContext: 8192,
  },
}

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

import { TokenUsageIndicator } from './TokenUsageIndicator'

describe('TokenUsageIndicator interactions', () => {
  beforeEach(() => {
    vi.useFakeTimers()
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
    expect(screen.getByText('Context Details')).toBeInTheDocument()

    fireEvent.mouseLeave(trigger)
    act(() => {
      vi.advanceTimersByTime(149)
    })
    expect(screen.getByText('Context Details')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.queryByText('Context Details')).not.toBeInTheDocument()
  })

  it('supports hover preview + click pin toggle without conflicts', () => {
    render(<TokenUsageIndicator input="" />)

    const trigger = screen.getByRole('button')

    fireEvent.mouseEnter(trigger)
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(screen.getByText('Context Details')).toBeInTheDocument()

    fireEvent.click(trigger)
    fireEvent.mouseLeave(trigger)

    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(screen.getByText('Context Details')).toBeInTheDocument()

    fireEvent.click(trigger)
    expect(screen.queryByText('Context Details')).not.toBeInTheDocument()
  })
})

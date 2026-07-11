import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AutomationRunSync from './AutomationRunSync'
import type { ScheduledAutomationRunRequest } from '@/electron/types'

const createSession = vi.fn()
const updateSessionTitle = vi.fn()
const addMessageToSession = vi.fn()
const updateStreamingMessage = vi.fn()
const createArtifact = vi.fn()
const loadFullSession = vi.fn()
const runProviderStream = vi.fn()
const resolveAutomationRun = vi.fn()

let automationRunCallback: ((request: ScheduledAutomationRunRequest) => void) | undefined

vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({
    settings: {
      modelProvider: 'openrouter',
      aiModel: 'fake-model',
      maxTokens: 1000,
    },
  }),
}))

vi.mock('@/contexts/ChatHistoryContext', () => ({
  useChatHistory: () => ({
    sessions: [{ id: 'current-chat', title: 'Current', messages: [], createdAt: 1, updatedAt: 1 }],
    createSession,
    updateSessionTitle,
    addMessageToSession,
    updateStreamingMessage,
    createArtifact,
    loadFullSession,
  }),
}))

vi.mock('@/hooks/useToolCalling', () => ({
  useToolCalling: () => ({
    canUseTools: false,
    getToolsForRequest: vi.fn(),
    getToolsForRequestAsync: vi.fn(),
    getResearchContext: vi.fn(() => ''),
    handleToolCalls: vi.fn(),
  }),
}))

vi.mock('@/agent/AgentToolApprovalContext', () => ({
  useAgentToolApproval: () => ({
    requestApproval: vi.fn(),
  }),
}))

vi.mock('./Dashboard/ChatArea/hooks/streaming/useProviderStreaming', () => ({
  useProviderStreaming: () => ({
    runProviderStream,
  }),
}))

describe('AutomationRunSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    automationRunCallback = undefined
    createSession.mockReturnValue('automation-task-1-request-1')
    addMessageToSession
      .mockReturnValueOnce('automation-user-message')
      .mockReturnValueOnce('automation-assistant-message')
    runProviderStream.mockResolvedValue({
      content: 'Automation output',
      model: 'openrouter/fake-model',
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
    })
    Object.defineProperty(window, 'scheduledTasks', {
      configurable: true,
      value: {
        resolveAutomationRun,
        onAutomationRunRequest: vi.fn((callback) => {
          automationRunCallback = callback
          return vi.fn()
        }),
      },
    })
  })

  afterEach(() => {
    Reflect.deleteProperty(window, 'scheduledTasks')
  })

  it('creates a fresh background chat and resolves the automation with its chat id', async () => {
    render(<AutomationRunSync />)

    await waitFor(() => expect(automationRunCallback).toBeDefined())

    automationRunCallback?.({
      requestId: 'request-1',
      taskId: 'task-1',
      taskTitle: 'Morning Brief',
      prompt: 'Summarize my day',
      instructions: '',
      automationMode: 'prompt',
      contextSources: [],
      allowedTools: [],
      approvalMode: 'read_only',
      outputDestinations: ['log'],
      notifyPolicy: 'every_run',
      budgets: {},
    })

    await waitFor(() => expect(resolveAutomationRun).toHaveBeenCalled())

    expect(createSession).toHaveBeenCalledWith(undefined, null, 'automation-task-1-request-1', {
      activate: false,
    })
    expect(updateSessionTitle).toHaveBeenCalledWith(
      'automation-task-1-request-1',
      'Automation: Morning Brief'
    )
    expect(addMessageToSession).toHaveBeenNthCalledWith(
      1,
      'automation-task-1-request-1',
      expect.objectContaining({ role: 'user', content: 'Summarize my day' })
    )
    expect(addMessageToSession).toHaveBeenNthCalledWith(
      2,
      'automation-task-1-request-1',
      expect.objectContaining({ role: 'assistant', content: '' })
    )
    expect(runProviderStream).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'automation-task-1-request-1',
        messageId: 'automation-assistant-message',
        syncToStreamingContext: false,
      })
    )
    expect(updateStreamingMessage).toHaveBeenCalledWith(
      'automation-task-1-request-1',
      'automation-assistant-message',
      expect.objectContaining({ content: 'Automation output' }),
      { persist: true }
    )
    expect(resolveAutomationRun).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'request-1',
        automationChatSessionId: 'automation-task-1-request-1',
        outputText: 'Automation output',
        deliveryStatus: expect.objectContaining({ chat: 'sent', log: 'sent' }),
      })
    )
  })
})

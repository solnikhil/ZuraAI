import { useCallback, useEffect } from 'react'

import { useAgentToolApproval } from '@/agent/AgentToolApprovalContext'
import type { FileAttachment, Message, ToolCallResult } from '@/chat/types'
import { useChatHistory } from '@/contexts/ChatHistoryContext'
import { useSettings } from '@/contexts/SettingsContext'
import { useToolCalling } from '@/hooks/useToolCalling'
import type { ServiceAssistantMessage } from '@/services/types'
import type {
  ScheduledAutomationRunRequest,
  ScheduledAutomationRunResponse,
} from '@/electron/types'
import { useProviderStreaming } from './Dashboard/ChatArea/hooks/streaming/useProviderStreaming'
import type { ToolCallingHook } from './Dashboard/ChatArea/hooks/streaming/types'

const AUTOMATION_SESSION_PREFIX = 'automation-'

function createAutomationMessageId(): string {
  return `automation-message-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function summarizeToolResults(results?: ToolCallResult[]): ScheduledAutomationRunResponse['toolCallSummaries'] {
  return (results || []).map((result) => ({
    name: result.toolCall.name,
    success: result.result.success === true,
    ...(result.result.error ? { error: result.result.error } : {}),
  }))
}

function summarizeFiles(files?: FileAttachment[]): ScheduledAutomationRunResponse['generatedFiles'] {
  return (files || []).map((file) => ({
    id: file.id,
    name: file.name,
    type: file.type,
  }))
}

function buildPrompt(request: ScheduledAutomationRunRequest, contextText: string): string {
  const modeLine =
    request.automationMode === 'watch'
      ? 'This is a watch automation. Compare the new result to the previous output and call out meaningful changes.'
      : request.automationMode === 'agent'
        ? 'This is an agent automation. Use only the tools that are available and necessary for the requested outcome.'
        : 'This is a scheduled prompt automation. Produce the requested deliverable directly.'

  return [
    'You are running a scheduled ZuraAI automation.',
    modeLine,
    '',
    `Automation: ${request.taskTitle}`,
    request.instructions.trim() ? `Instructions: ${request.instructions.trim()}` : '',
    '',
    'User prompt:',
    request.prompt,
    '',
    contextText.trim() ? `Context:\n${contextText}` : '',
    request.previousOutput?.trim()
      ? `Previous output:\n${request.previousOutput.slice(0, 6000)}`
      : '',
    '',
    'Return a concise, useful result. Do not mention internal scheduling mechanics unless relevant.',
  ].filter(Boolean).join('\n')
}

function buildChangeVerdict(outputText: string, previousOutput?: string): ScheduledAutomationRunResponse['changeVerdict'] {
  const previous = (previousOutput || '').replace(/\s+/g, ' ').trim()
  const next = outputText.replace(/\s+/g, ' ').trim()
  if (!previous) {
    return { changed: true, summary: 'Baseline automation output recorded.' }
  }
  if (previous === next) {
    return { changed: false, summary: 'No meaningful change from the previous automation output.' }
  }
  return { changed: true, summary: 'The automation output changed from the previous run.' }
}

export function AutomationRunSync(): null {
  const { settings } = useSettings()
  const chatHistory = useChatHistory()
  const toolCalling = useToolCalling()
  const streamingToolCalling: ToolCallingHook = {
    canUseTools: toolCalling.canUseTools,
    getToolsForRequest: toolCalling.getToolsForRequest,
    getToolsForRequestAsync: toolCalling.getToolsForRequestAsync,
    getResearchContext: toolCalling.getResearchContext,
    handleToolCalls: (response, options) =>
      toolCalling.handleToolCalls(
        response,
        options?.onToolStart,
        options?.onToolComplete,
        options?.executionPolicy,
        {
          onToolApprovalStart: options?.onToolApprovalStart,
          onToolApprovalResolved: options?.onToolApprovalResolved,
          requestToolApproval: options?.requestToolApproval,
        }
      ),
  }
  const approval = useAgentToolApproval()
  const { runProviderStream } = useProviderStreaming({
    settings,
    toolCalling: streamingToolCalling,
    updateStreamingMessage: () => undefined,
    flushThrottledUpdates: () => undefined,
    throttledUpdateStreamingMessage: () => undefined,
  })

  const resolveContext = useCallback(async (request: ScheduledAutomationRunRequest): Promise<string> => {
    const lines: string[] = []
    for (const source of request.contextSources) {
      if (source.type === 'current_datetime') {
        lines.push(`Current date/time: ${new Date().toLocaleString()}`)
      } else if (source.type === 'chat' && source.id) {
        const session = await chatHistory.loadFullSession(source.id, { limit: 40 })
        const messages = session?.messages?.slice(-12) ?? []
        if (messages.length > 0) {
          lines.push([
            `Chat context${source.label ? ` (${source.label})` : ''}:`,
            ...messages.map((message) => `${message.role}: ${String(message.content).slice(0, 1000)}`),
          ].join('\n'))
        }
      } else if (source.type === 'folder_memory' && source.id && window.memory?.search) {
        const memories = await window.memory.search(request.prompt, 8, {
          type: 'project',
          projectId: source.id,
          includeGlobal: true,
        })
        if (memories.length > 0) {
          lines.push([
            `Folder memory${source.label ? ` (${source.label})` : ''}:`,
            ...memories.map((memory) => `- ${memory.content}`),
          ].join('\n'))
        }
      } else if (source.value || source.label) {
        lines.push(`${source.label || source.type}: ${source.value || source.id || ''}`)
      }
    }
    return lines.join('\n\n').slice(0, 12000)
  }, [chatHistory])

  const deliverToChatAndArtifacts = useCallback((
    request: ScheduledAutomationRunRequest,
    outputText: string
  ): Pick<ScheduledAutomationRunResponse, 'artifactIds' | 'deliveryStatus'> => {
    const deliveryStatus: ScheduledAutomationRunResponse['deliveryStatus'] = {}
    const destinations = request.outputDestinations
    let sessionId = `${AUTOMATION_SESSION_PREFIX}${request.taskId}`
    if (destinations.includes('chat') || destinations.includes('artifact')) {
      const existing = chatHistory.sessions.find((session) => session.id === sessionId)
      if (!existing) {
        sessionId = chatHistory.createSession(undefined, null, sessionId)
        chatHistory.updateSessionTitle(sessionId, `Automation: ${request.taskTitle}`)
      }
      const userMessageId = chatHistory.addMessageToSession(sessionId, {
        role: 'user',
        content: request.prompt,
      } as Omit<Message, 'id' | 'timestamp'>)
      chatHistory.addMessageToSession(sessionId, {
        role: 'assistant',
        content: outputText,
        model: `${settings.modelProvider}/${settings.aiModel}`,
      } as Omit<Message, 'id' | 'timestamp'>)
      deliveryStatus.chat = 'sent'

      if (destinations.includes('artifact')) {
        const artifact = chatHistory.createArtifact(sessionId, {
          title: request.taskTitle,
          kind: 'markdown',
          language: 'markdown',
          content: outputText,
          sourceMessageId: userMessageId,
        })
        deliveryStatus.artifact = artifact ? 'sent' : 'error'
        return {
          artifactIds: artifact ? [artifact.id] : [],
          deliveryStatus,
        }
      }
    }
    return { deliveryStatus }
  }, [chatHistory, settings.aiModel, settings.modelProvider])

  useEffect(() => {
    if (!window.scheduledTasks?.onAutomationRunRequest) return undefined

    return window.scheduledTasks.onAutomationRunRequest((request) => {
      const controller = new AbortController()
      const timeout = window.setTimeout(
        () => controller.abort(),
        Math.max(10_000, Math.min(15 * 60_000, request.budgets.timeoutMs ?? 120_000))
      )

      void (async () => {
        try {
          const contextText = await resolveContext(request)
          const prompt = buildPrompt(request, contextText)
          const allowTools = request.automationMode === 'agent' && request.allowedTools.length > 0
          const settingsOverride = allowTools
            ? {
                ...settings,
                assistantMode: 'agent' as const,
                enabledTools: request.allowedTools,
              }
            : settings

          const result = allowTools
            ? await runProviderStream({
                provider: settings.modelProvider,
                model: settings.aiModel,
                settingsOverride,
                sessionId: `automation-run-${request.taskId}`,
                messageId: createAutomationMessageId(),
                messages: [{ role: 'user', content: prompt }] as ServiceAssistantMessage[],
                startTime: performance.now(),
                researchMaxRounds: request.budgets.maxWebSearches ?? 0,
                signal: controller.signal,
                enableTools: true,
                syncToStreamingContext: false,
                toolEventCallbacks: {
                  executionPolicy: {
                    remainingWebSearchBudget: request.budgets.maxWebSearches ?? 0,
                    remainingToolCallBudget: request.budgets.maxToolCalls ?? Number.MAX_SAFE_INTEGER,
                    userContextText: prompt,
                  },
                  requestToolApproval:
                    request.approvalMode === 'read_only'
                      ? async () => false
                      : approval.requestApproval,
                },
              })
            : {
                ...(await runProviderStream({
                  provider: settings.modelProvider,
                  model: settings.aiModel,
                  settingsOverride: {
                    ...settings,
                    maxTokens: request.budgets.maxTokens ?? settings.maxTokens,
                  },
                  sessionId: `automation-run-${request.taskId}`,
                  messageId: createAutomationMessageId(),
                  messages: [{ role: 'user', content: prompt }] as ServiceAssistantMessage[],
                  startTime: performance.now(),
                  researchMaxRounds: 0,
                  signal: controller.signal,
                  enableTools: false,
                  syncToStreamingContext: false,
                })),
                toolResults: [],
              }

          const outputText = result.content.trim()
          const delivery = deliverToChatAndArtifacts(request, outputText)
          const response: ScheduledAutomationRunResponse = {
            requestId: request.requestId,
            outputText,
            resolvedContextSummary: contextText,
            model: result.model,
            provider: settings.modelProvider,
            generatedFiles: summarizeFiles(result.files),
            toolCallSummaries: summarizeToolResults(result.toolResults ?? undefined),
            usage: result.usage,
            ...(request.automationMode === 'watch'
              ? { changeVerdict: buildChangeVerdict(outputText, request.previousOutput) }
              : {}),
            deliveryStatus: {
              log: 'sent',
              ...delivery.deliveryStatus,
            },
            ...(delivery.artifactIds ? { artifactIds: delivery.artifactIds } : {}),
          }
          await window.scheduledTasks.resolveAutomationRun(response)
        } catch (error) {
          await window.scheduledTasks.resolveAutomationRun({
            requestId: request.requestId,
            error: error instanceof Error ? error.message : String(error),
          })
        } finally {
          window.clearTimeout(timeout)
        }
      })()
    })
  }, [approval.requestApproval, deliverToChatAndArtifacts, resolveContext, runProviderStream, settings])

  return null
}

export default AutomationRunSync

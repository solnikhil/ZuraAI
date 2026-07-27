import type { Message } from '../../../../contexts/ChatHistoryContext'
import type { StreamingMessageState } from '../../../../contexts/StreamingContext'
import type { StreamingResult } from './streaming'
import type { ChatRunController, ChatRunOutcome } from './chatRunController'

export function finalizeChatRun(
  run: ChatRunController,
  outcome: ChatRunOutcome,
  finalizer: () => void,
  cleanup: () => void
): boolean {
  const finalizeWithCleanup = () => {
    try {
      finalizer()
    } finally {
      cleanup()
    }
  }
  if (outcome === 'completed') return run.complete(finalizeWithCleanup)
  if (outcome === 'cancelled') return run.cancel(finalizeWithCleanup)
  return run.fail(finalizeWithCleanup)
}

export function buildChatRunResultUpdates(result: StreamingResult): Partial<Message> {
  return {
    content: result.content,
    thinkingBlocks: result.thinkingBlocks,
    files: result.files,
    toolResults: result.toolResults ?? undefined,
    usage: result.usage,
    latency: result.latency,
    model: result.model,
    finishReason: result.finishReason,
  }
}

export interface RegenerationTransaction {
  commit: (result: StreamingResult) => boolean
  rollback: () => boolean
}

/**
 * Keeps the existing assistant response authoritative until regeneration succeeds.
 * Cancellation and failure only settle the transaction; no compensating history
 * write is needed because the original message was never removed.
 */
export function createRegenerationTransaction({
  sessionId,
  message,
  model,
  responseVersions,
  updateMessage,
}: {
  sessionId: string
  message: Message
  model: string
  responseVersions: NonNullable<Message['responseVersions']>
  updateMessage: (
    sessionId: string,
    messageId: string,
    updates: Partial<Message>,
    options: { persist: true }
  ) => void
}): RegenerationTransaction {
  let settled = false

  return {
    commit(result) {
      if (settled) return false
      settled = true
      updateMessage(
        sessionId,
        message.id,
        {
          ...buildChatRunResultUpdates(result),
          model: result.model ?? model,
          responseVersions,
          currentVersionIndex: responseVersions.length,
        },
        { persist: true }
      )
      return true
    },
    rollback() {
      if (settled) return false
      settled = true
      return true
    },
  }
}

export function mergeStreamingFinalState(
  finalState: StreamingMessageState,
  result: StreamingResult
): Partial<Message> {
  const resultUpdates = buildChatRunResultUpdates(result)
  const updates: Partial<Message> = { ...resultUpdates }
  const state = finalState as Partial<Message>
  const fields: Array<keyof Message> = [
    'content',
    'thinking',
    'thinkingDuration',
    'thinkingBlocks',
    'researchStatus',
    'researchPlan',
    'researchProgress',
    'toolResults',
    'agentRun',
    'files',
    'model',
    'latency',
    'usage',
  ]

  for (const field of fields) {
    if (resultUpdates[field] === undefined && Object.prototype.hasOwnProperty.call(state, field)) {
      Object.assign(updates, { [field]: state[field] })
    }
  }
  return updates
}

import type { FileAttachment, ThinkingBlock } from '../../../../../chat/types'
import type { DeltaToolCall } from './streamingUtils'

export function accumulateDeltaToolCalls(
  accumulator: DeltaToolCall[],
  deltaToolCalls: DeltaToolCall[]
): void {
  for (const toolCall of deltaToolCalls) {
    const index = toolCall.index ?? 0
    if (!accumulator[index]) {
      accumulator[index] = {
        id: toolCall.id || '',
        type: toolCall.type || 'function',
        function: { name: '', arguments: '' },
      }
    }
    if (toolCall.function?.name) {
      accumulator[index].function!.name += toolCall.function.name
    }
    if (toolCall.function?.arguments) {
      accumulator[index].function!.arguments += toolCall.function.arguments
    }
  }
}

export function appendCompletedThinkingBlock(
  existingBlocks: ThinkingBlock[],
  content: string | undefined,
  duration?: number
): ThinkingBlock[] {
  const normalizedContent = content?.trim()
  if (!normalizedContent) return existingBlocks
  return [
    ...existingBlocks,
    {
      type: 'thinking',
      content: normalizedContent,
      ...(duration !== undefined ? { duration: Math.max(0, duration) } : {}),
      timestamp: Date.now(),
    },
  ]
}

export function shouldSkipStrayReasoningDelta(
  delta: string | undefined,
  completedBlocks: ThinkingBlock[],
  activeThinking: string,
  hasAnswerContent: boolean
): boolean {
  const normalizedDelta = delta?.trim()
  if (!normalizedDelta || !hasAnswerContent) return false
  const transcript = [
    ...completedBlocks
      .filter((block) => block.type === 'thinking' && block.content)
      .map((block) => block.content!.trim()),
    activeThinking.trim(),
  ]
    .filter(Boolean)
    .join('')
  return Boolean(
    transcript &&
    (normalizedDelta === transcript ||
      (normalizedDelta.length < transcript.length && transcript.startsWith(normalizedDelta)))
  )
}

export function mergeGeneratedFiles(
  existing: FileAttachment[],
  incoming: FileAttachment[]
): FileAttachment[] {
  if (incoming.length === 0) return existing
  const merged = [...existing]
  const seen = new Set(existing.map((file) => file.data))
  for (const file of incoming) {
    if (seen.has(file.data)) continue
    seen.add(file.data)
    merged.push(file)
  }
  return merged
}

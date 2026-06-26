import type { StreamingPhase } from '../../../../../contexts/StreamingContext'

const PHASES_LOCKED_TO_ANSWERING: ReadonlySet<StreamingPhase> = new Set([
  'reasoning',
  'tool',
  'searching',
])

/**
 * Once visible answer content exists, non-answering phases must not regress so
 * MessageRenderer's single after-thinking insertion site stays stable.
 */
export function resolveStreamPhase(
  phase: StreamingPhase,
  hasVisibleAnswerContent: boolean
): StreamingPhase {
  if (hasVisibleAnswerContent && PHASES_LOCKED_TO_ANSWERING.has(phase)) {
    return 'answering'
  }
  return phase
}
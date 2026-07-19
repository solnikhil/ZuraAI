import type { ToolCallResult } from './types'

const INFRASTRUCTURE_ERROR_PATTERNS = [
  /content security policy/i,
  /unsafe-eval/i,
  /refused to evaluate a string as javascript/i,
  /ipc.*(?:unavailable|failed|handler)/i,
  /no handler registered/i,
  /(?:preload|tool).*bridge.*(?:unavailable|missing|failed)/i,
  /(?:schema|validator).*(?:compile|initializ).*(?:fail|error)/i,
  /tool (?:execution|runtime).*(?:unavailable|initialization failed)/i,
]

const INTERNAL_DESKTOP_RUNTIME_ERROR_PATTERNS = [
  /object is not iterable/i,
  /cannot read propert(?:y|ies) of (?:undefined|null)/i,
  /is not a function(?:\s|$)/i,
]

const INTERNAL_DESKTOP_TOOL_PREFIXES = ['app_', 'background_window_', 'computer_', 'ui_', 'window_']

function normalizeError(error: string): string {
  return error
    .trim()
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '<id>')
    .replace(/\b\d+(?:\.\d+)?\b/g, '<number>')
    .replace(/\s+/g, ' ')
}

function isInfrastructureError(toolName: string, error: string): boolean {
  if (INFRASTRUCTURE_ERROR_PATTERNS.some((pattern) => pattern.test(error))) return true

  return (
    INTERNAL_DESKTOP_TOOL_PREFIXES.some((prefix) => toolName.startsWith(prefix)) &&
    INTERNAL_DESKTOP_RUNTIME_ERROR_PATTERNS.some((pattern) => pattern.test(error))
  )
}

export interface SystemicToolFailure {
  error: string
  toolNames: string[]
  occurrenceCount: number
}

/**
 * Detects one infrastructure failure repeated by distinct tools during one run.
 * Ordinary tool/domain failures are deliberately ignored: a missing file or app
 * is evidence about that one operation, not evidence that the tool runtime is down.
 */
export class SystemicToolFailureTracker {
  private readonly failures = new Map<string, { error: string; toolCounts: Map<string, number> }>()

  record(results: ToolCallResult[]): SystemicToolFailure | null {
    for (const result of results) {
      if (result.result.success) {
        this.clearRecoveredTool(result.toolCall.name)
        continue
      }

      const error = result.result.error
      if (!error || !isInfrastructureError(result.toolCall.name, error)) continue

      const fingerprint = normalizeError(error)
      const existing = this.failures.get(fingerprint) ?? {
        error: error.trim(),
        toolCounts: new Map<string, number>(),
      }
      existing.toolCounts.set(
        result.toolCall.name,
        (existing.toolCounts.get(result.toolCall.name) ?? 0) + 1
      )
      this.failures.set(fingerprint, existing)

      const occurrenceCount = [...existing.toolCounts.values()].reduce(
        (total, count) => total + count,
        0
      )
      const repeatedByOneTool = [...existing.toolCounts.values()].some((count) => count >= 2)
      if (existing.toolCounts.size >= 2 || repeatedByOneTool) {
        return {
          error: existing.error,
          toolNames: [...existing.toolCounts.keys()],
          occurrenceCount,
        }
      }
    }

    return null
  }

  private clearRecoveredTool(toolName: string): void {
    for (const [fingerprint, failure] of this.failures) {
      failure.toolCounts.delete(toolName)
      if (failure.toolCounts.size === 0) this.failures.delete(fingerprint)
    }
  }
}

export function buildSystemicToolFailureMessage(failure: SystemicToolFailure): string {
  const conciseError = failure.error.replace(/\s+/g, ' ').slice(0, 240)
  const failureScope =
    failure.toolNames.length > 1
      ? 'failed consistently across multiple tools'
      : `failed repeatedly in ${failure.toolNames[0] ?? 'the same tool'}`
  return [
    `I couldn't inspect or control the requested application because Zura's tool runtime ${failureScope}.`,
    `The reported infrastructure error was: ${conciseError}`,
    'I stopped instead of retrying or making assumptions. I cannot confirm whether the application is running, what is visible in it, or whether any requested action occurred. Please restart Zura and try again; if the error continues, the tool runtime needs to be repaired.',
  ].join('\n\n')
}

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

function normalizeError(error: string): string {
  return error
    .trim()
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '<id>')
    .replace(/\b\d+(?:\.\d+)?\b/g, '<number>')
    .replace(/\s+/g, ' ')
}

function isInfrastructureError(error: string): boolean {
  return INFRASTRUCTURE_ERROR_PATTERNS.some((pattern) => pattern.test(error))
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
  private readonly failures = new Map<
    string,
    { error: string; toolNames: Set<string>; occurrenceCount: number }
  >()

  record(results: ToolCallResult[]): SystemicToolFailure | null {
    for (const result of results) {
      const error = result.result.success ? undefined : result.result.error
      if (!error || !isInfrastructureError(error)) continue

      const fingerprint = normalizeError(error)
      const existing = this.failures.get(fingerprint) ?? {
        error: error.trim(),
        toolNames: new Set<string>(),
        occurrenceCount: 0,
      }
      existing.toolNames.add(result.toolCall.name)
      existing.occurrenceCount += 1
      this.failures.set(fingerprint, existing)

      if (existing.toolNames.size >= 2) {
        return {
          error: existing.error,
          toolNames: [...existing.toolNames],
          occurrenceCount: existing.occurrenceCount,
        }
      }
    }

    return null
  }
}

export function buildSystemicToolFailureMessage(failure: SystemicToolFailure): string {
  const conciseError = failure.error.replace(/\s+/g, ' ').slice(0, 240)
  return [
    "I couldn't inspect or control the requested application because Zura's tool runtime failed consistently across multiple tools.",
    `The reported infrastructure error was: ${conciseError}`,
    'I stopped instead of retrying or making assumptions. I cannot confirm whether the application is running, what is visible in it, or whether any requested action occurred. Please restart Zura and try again; if the error continues, the tool runtime needs to be repaired.',
  ].join('\n\n')
}

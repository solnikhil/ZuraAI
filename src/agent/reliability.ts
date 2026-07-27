import type { AgentVerificationOutcome, ToolCallResult } from '../chat/types'
import {
  getToolSecurityProfile,
  type ToolVerificationCategory,
} from '../tools/builtinMainToolContract'

export type { AgentVerificationOutcome } from '../chat/types'

export interface AgentPlanPrompt {
  goal: string
  intendedToolPath: string
  expectedOutcome: string
  verificationMethod: string
}

export interface AgentVerificationStrategy {
  category: 'file' | 'app-window' | 'visual' | 'shell' | 'generic'
  reason: string
  preferredTools: string[]
  mutatingToolNames: string[]
  postconditions: AgentVerificationPostcondition[]
}

export type AgentVerificationPostcondition =
  | { kind: 'file-content'; path: string; expectedContent: string }
  | { kind: 'file-exists'; path: string }
  | { kind: 'file-absent'; path: string }
  | { kind: 'ui-value'; elementId: string; expectedValue: string }
  | { kind: 'ui-selected'; elementId: string; expectedSelected: boolean }

export type AgentVerificationCheckpointPhase = 'initial' | 'recovery' | 'verified' | 'failed'

export interface AgentVerificationCheckpointState {
  phase: AgentVerificationCheckpointPhase
  /** The strongest evidence outcome observed so far. Present after an attempt completes. */
  outcome?: AgentVerificationOutcome
}

export function createAgentVerificationCheckpoint(): AgentVerificationCheckpointState {
  return { phase: 'initial' }
}

function combineUnverifiedOutcomes(
  previous: AgentVerificationOutcome | undefined,
  current: Exclude<AgentVerificationOutcome, 'verified'>
): Exclude<AgentVerificationOutcome, 'verified'> {
  return previous === 'contradicted' || current === 'contradicted' ? 'contradicted' : 'inconclusive'
}

/**
 * Advance one mutation checkpoint. Every non-verifying initial attempt receives exactly one
 * recovery; every non-verifying recovery is terminal. Terminal states are idempotent.
 */
export function advanceAgentVerificationCheckpoint(
  state: AgentVerificationCheckpointState,
  outcome: AgentVerificationOutcome
): AgentVerificationCheckpointState {
  if (state.phase === 'verified' || state.phase === 'failed') return state
  if (outcome === 'verified') return { phase: 'verified', outcome }

  const combinedOutcome = combineUnverifiedOutcomes(state.outcome, outcome)
  if (state.phase === 'initial') {
    return { phase: 'recovery', outcome: combinedOutcome }
  }
  return { phase: 'failed', outcome: combinedOutcome }
}

function compactTaskText(taskText: string | undefined): string {
  const normalized = (taskText || '').replace(/\s+/g, ' ').trim()
  if (!normalized) return 'Complete the requested Agent mode task.'
  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized
}

export function buildAgentPlanPrompt(taskText: string | undefined): AgentPlanPrompt {
  return {
    goal: compactTaskText(taskText),
    intendedToolPath:
      'Inspect with native tools first: file/app/window/UIA tools before targeted screenshots, and full-screen screenshots only as a last resort.',
    expectedOutcome:
      'Complete the requested task, or report the exact blocker without acting blindly.',
    verificationMethod:
      'After any mutating action, verify with a read-only native tool or targeted screenshot before the final answer.',
  }
}

function verificationCategory(result: ToolCallResult): ToolVerificationCategory | null {
  return (
    getToolSecurityProfile(result.toolCall.name, result.toolCall.arguments)?.verification ?? null
  )
}

function isSuccessfulMutatingResult(result: ToolCallResult): boolean {
  const toolName = result.toolCall.name
  if (!result.result?.success) return false
  if (
    toolName === 'system_shell' &&
    typeof (result.result.data as { exitCode?: unknown } | undefined)?.exitCode === 'number' &&
    (result.result.data as { exitCode: number }).exitCode !== 0
  ) {
    return false
  }
  return getToolSecurityProfile(toolName, result.toolCall.arguments)?.mutation === 'mutating'
}

function stringArgument(result: ToolCallResult, name: string): string | undefined {
  const value = result.toolCall.arguments?.[name]
  return typeof value === 'string' ? value : undefined
}

function buildVerificationPostconditions(
  mutatingResults: ToolCallResult[]
): AgentVerificationPostcondition[] {
  return mutatingResults.flatMap((result): AgentVerificationPostcondition[] => {
    const toolName = result.toolCall.name
    if (toolName === 'file_write') {
      const path = stringArgument(result, 'path')
      const expectedContent = stringArgument(result, 'content')
      return path !== undefined && expectedContent !== undefined
        ? [{ kind: 'file-content', path, expectedContent }]
        : []
    }
    if (toolName === 'file_move') {
      const source = stringArgument(result, 'source')
      const destination = stringArgument(result, 'destination')
      return source && destination
        ? [
            { kind: 'file-exists', path: destination },
            { kind: 'file-absent', path: source },
          ]
        : []
    }
    if (toolName === 'ui_set_value' || toolName === 'ui_type_text') {
      const elementId = stringArgument(result, 'element_id')
      const expectedValue = stringArgument(result, toolName === 'ui_type_text' ? 'text' : 'value')
      return elementId && expectedValue !== undefined
        ? [{ kind: 'ui-value', elementId, expectedValue }]
        : []
    }
    if (toolName === 'ui_select') {
      const elementId = stringArgument(result, 'element_id')
      // ui_select is a toggle/select command and has no `selected` input. Its main-process
      // result contains fresh UI state, so capture the observed post-action state as the
      // condition that a separate read-only observation must reproduce.
      const selectedElement = elementId
        ? collectUiElements(result.result?.data).find(
            (candidate) => candidate.element_id === elementId
          )
        : undefined
      const expectedSelected = selectedElement?.selected
      return elementId && typeof expectedSelected === 'boolean'
        ? [{ kind: 'ui-selected', elementId, expectedSelected }]
        : []
    }
    return []
  })
}

export function hasFreshMutationEvidence(toolResults: ToolCallResult[] | undefined): boolean {
  return (toolResults || []).some((result) => {
    if (!isSuccessfulMutatingResult(result)) return false
    const data = result.result?.data as
      | {
          visualChange?: unknown
          screenshotId?: unknown
          status?: unknown
          state?: { state_id?: unknown }
          delivery?: { mode?: unknown; semanticOutcome?: unknown }
        }
      | undefined

    if (
      verificationCategory(result) === 'visual' &&
      data?.visualChange === 'changed' &&
      typeof data.screenshotId === 'string' &&
      data.screenshotId.length > 0
    ) {
      if (
        data.delivery?.mode === 'background_automation' &&
        data.delivery.semanticOutcome !== 'verified'
      ) {
        return false
      }
      return true
    }

    return (
      verificationCategory(result) === 'app-window' &&
      data?.status === 'completed' &&
      typeof data.state?.state_id === 'string' &&
      data.state.state_id.length > 0
    )
  })
}

export function selectVerificationStrategy(
  toolResults: ToolCallResult[] | undefined
): AgentVerificationStrategy | null {
  const unchangedVisualResults = (toolResults || []).filter((result) => {
    const data = result.result?.data as { visualChange?: unknown } | undefined
    return (
      result.result?.success === true &&
      verificationCategory(result) === 'visual' &&
      data?.visualChange === 'unchanged'
    )
  })
  if (unchangedVisualResults.length > 0) {
    return {
      category: 'visual',
      reason:
        'The physical action completed but the target image was unchanged, so the intended UI effect is not verified.',
      preferredTools: ['computer_screenshot'],
      mutatingToolNames: Array.from(
        new Set(unchangedVisualResults.map((result) => result.toolCall.name))
      ),
      postconditions: buildVerificationPostconditions(unchangedVisualResults),
    }
  }

  const mutatingResults = (toolResults || []).filter(isSuccessfulMutatingResult)
  if (mutatingResults.length === 0) return null

  const mutatingToolNames = Array.from(
    new Set(mutatingResults.map((result) => result.toolCall.name))
  )
  const postconditions = buildVerificationPostconditions(mutatingResults)

  const categories = new Set(mutatingResults.map(verificationCategory))

  if (categories.has('file')) {
    return {
      category: 'file',
      reason: 'File changes were made and need a read-only filesystem check.',
      preferredTools: ['file_search', 'file_read'],
      mutatingToolNames,
      postconditions,
    }
  }

  if (categories.has('app-window')) {
    return {
      category: 'app-window',
      reason: 'App, window, or UI Automation state changed and needs a structured state check.',
      preferredTools: ['ui_get_app_state', 'ui_find', 'ui_wait_for', 'window_list'],
      mutatingToolNames,
      postconditions,
    }
  }

  if (categories.has('visual')) {
    return {
      category: 'visual',
      reason: 'A visual Computer Use action changed the desktop and needs a targeted screenshot.',
      preferredTools: ['computer_screenshot'],
      mutatingToolNames,
      postconditions,
    }
  }

  if (categories.has('shell')) {
    return {
      category: 'shell',
      reason: 'A shell or code action changed state and needs output review or a read-only check.',
      preferredTools: ['file_search', 'file_read', 'window_list', 'ui_get_app_state'],
      mutatingToolNames,
      postconditions,
    }
  }

  return {
    category: 'generic',
    reason: 'A mutating tool ran and needs an explicit verification pass.',
    preferredTools: [
      'file_search',
      'file_read',
      'window_list',
      'ui_get_app_state',
      'computer_screenshot',
    ],
    mutatingToolNames,
    postconditions,
  }
}

export function didVerificationSucceed(
  strategy: AgentVerificationStrategy,
  toolResults: ToolCallResult[] | undefined
): boolean {
  return assessVerificationEvidence(strategy, toolResults) === 'verified'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function explicitVerificationOutcome(data: unknown): AgentVerificationOutcome | undefined {
  if (!isRecord(data)) return undefined
  for (const value of [data.verificationOutcome, data.semanticOutcome]) {
    if (value === 'verified' || value === 'contradicted' || value === 'inconclusive') return value
    if (value === 'unverified') return 'inconclusive'
  }
  return undefined
}

function normalizeComparablePath(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

function pathsMatch(actual: string, expected: string): boolean {
  const normalizedActual = normalizeComparablePath(actual)
  const normalizedExpected = normalizeComparablePath(expected)
  return (
    normalizedActual === normalizedExpected ||
    (!/^[a-z]:\//.test(normalizedExpected) &&
      normalizedActual.endsWith(`/${normalizedExpected.replace(/^\.\//, '')}`))
  )
}

function basename(value: string): string {
  return normalizeComparablePath(value).split('/').at(-1) || ''
}

function dirname(value: string): string {
  const normalized = normalizeComparablePath(value)
  const separator = normalized.lastIndexOf('/')
  return separator < 0 ? '.' : normalized.slice(0, separator)
}

function resultPaths(data: Record<string, unknown>): string[] {
  if (!Array.isArray(data.results)) return []
  return data.results.flatMap((entry) => {
    if (typeof entry === 'string') return [entry]
    return isRecord(entry) && typeof entry.path === 'string' ? [entry.path] : []
  })
}

function searchCoversPath(result: ToolCallResult, data: Record<string, unknown>, path: string) {
  const query =
    typeof data.query === 'string'
      ? data.query
      : typeof result.toolCall.arguments?.query === 'string'
        ? result.toolCall.arguments.query
        : ''
  const root =
    typeof data.root === 'string'
      ? data.root
      : typeof result.toolCall.arguments?.root === 'string'
        ? result.toolCall.arguments.root
        : ''
  return query.toLowerCase() === basename(path) && Boolean(root) && pathsMatch(root, dirname(path))
}

function assessFilePostcondition(
  postcondition: Extract<
    AgentVerificationPostcondition,
    { kind: 'file-content' | 'file-exists' | 'file-absent' }
  >,
  results: ToolCallResult[]
): AgentVerificationOutcome {
  let observed: AgentVerificationOutcome = 'inconclusive'
  for (const result of results) {
    const data = isRecord(result.result?.data) ? result.result.data : undefined
    if (result.toolCall.name === 'file_read') {
      const requestedPath = stringArgument(result, 'path')
      const returnedPath = data && typeof data.path === 'string' ? data.path : requestedPath
      if (!returnedPath || !pathsMatch(returnedPath, postcondition.path)) continue
      if (!result.result?.success) {
        const missing = /not found|enoent|cannot find|does not exist/i.test(
          result.result?.error || ''
        )
        if (!missing) continue
        observed = postcondition.kind === 'file-absent' ? 'verified' : 'contradicted'
        continue
      }
      if (postcondition.kind === 'file-absent') return 'contradicted'
      if (postcondition.kind === 'file-exists') observed = 'verified'
      if (postcondition.kind === 'file-content' && typeof data?.content === 'string') {
        observed = data.content === postcondition.expectedContent ? 'verified' : 'contradicted'
      }
    }
    if (result.toolCall.name === 'file_search' && data) {
      if (!searchCoversPath(result, data, postcondition.path)) continue
      const found = resultPaths(data).some((path) => pathsMatch(path, postcondition.path))
      if (postcondition.kind === 'file-content') {
        if (!found) observed = 'contradicted'
      } else if (postcondition.kind === 'file-exists') {
        observed = found ? 'verified' : 'contradicted'
      } else {
        observed = found ? 'contradicted' : 'verified'
      }
    }
  }
  return observed
}

function collectUiElements(value: unknown, elements: Record<string, unknown>[] = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectUiElements(item, elements)
    return elements
  }
  if (!isRecord(value)) return elements
  if (typeof value.element_id === 'string') elements.push(value)
  for (const key of ['matches', 'windows', 'elements', 'children']) {
    if (key in value) collectUiElements(value[key], elements)
  }
  if ('state' in value) collectUiElements(value.state, elements)
  return elements
}

function assessUiPostcondition(
  postcondition: Extract<AgentVerificationPostcondition, { kind: 'ui-value' | 'ui-selected' }>,
  results: ToolCallResult[]
): AgentVerificationOutcome {
  for (const result of results) {
    if (!result.result?.success) continue
    const element = collectUiElements(result.result.data).find(
      (candidate) => candidate.element_id === postcondition.elementId
    )
    if (!element) continue
    if (postcondition.kind === 'ui-value') {
      return typeof element.value === 'string'
        ? element.value === postcondition.expectedValue
          ? 'verified'
          : 'contradicted'
        : 'inconclusive'
    }
    return typeof element.selected === 'boolean'
      ? element.selected === postcondition.expectedSelected
        ? 'verified'
        : 'contradicted'
      : 'inconclusive'
  }
  return 'inconclusive'
}

function assessPostcondition(
  postcondition: AgentVerificationPostcondition,
  results: ToolCallResult[]
): AgentVerificationOutcome {
  return postcondition.kind.startsWith('file-')
    ? assessFilePostcondition(
        postcondition as Extract<
          AgentVerificationPostcondition,
          { kind: 'file-content' | 'file-exists' | 'file-absent' }
        >,
        results
      )
    : assessUiPostcondition(
        postcondition as Extract<
          AgentVerificationPostcondition,
          { kind: 'ui-value' | 'ui-selected' }
        >,
        results
      )
}

/**
 * Classify only preferred read-only evidence. Dispatch success without substantive evidence is
 * inconclusive; explicit negative evidence is preserved as contradicted.
 */
export function assessVerificationEvidence(
  strategy: AgentVerificationStrategy,
  toolResults: ToolCallResult[] | undefined
): AgentVerificationOutcome {
  const allowedTools = new Set(strategy.preferredTools)
  const preferredResults = (toolResults || []).filter((result) =>
    allowedTools.has(result.toolCall.name)
  )
  const explicitOutcomes = preferredResults
    .map((result) => explicitVerificationOutcome(result.result?.data))
    .filter((outcome): outcome is AgentVerificationOutcome => Boolean(outcome))
  if (explicitOutcomes.includes('contradicted')) return 'contradicted'
  if (strategy.postconditions.length === 0) {
    return explicitOutcomes.includes('verified') ? 'verified' : 'inconclusive'
  }
  const outcomes = strategy.postconditions.map((postcondition) =>
    assessPostcondition(postcondition, preferredResults)
  )
  if (outcomes.includes('contradicted')) return 'contradicted'
  if (outcomes.every((outcome) => outcome === 'verified')) return 'verified'
  return 'inconclusive'
}

function describePostcondition(postcondition: AgentVerificationPostcondition): string {
  if (postcondition.kind === 'file-content') {
    return `file ${postcondition.path} exists with the exact written content (${postcondition.expectedContent.length} characters)`
  }
  if (postcondition.kind === 'file-exists') return `file ${postcondition.path} exists`
  if (postcondition.kind === 'file-absent') return `file ${postcondition.path} is absent`
  if (postcondition.kind === 'ui-value') {
    return `UI element ${postcondition.elementId} has value ${JSON.stringify(postcondition.expectedValue)}`
  }
  return `UI element ${postcondition.elementId} is ${postcondition.expectedSelected ? 'selected' : 'not selected'}`
}

export function buildAgentVerificationPrompt(
  strategy: AgentVerificationStrategy,
  options?: { recoveryAttempt?: boolean }
): string {
  const recoveryPrefix = options?.recoveryAttempt
    ? '*** AGENT VERIFICATION RECOVERY REQUIRED *** The previous verification attempt did not clearly verify the outcome. Make exactly one more read-only verification attempt, then stop.\n'
    : '*** AGENT VERIFICATION CHECKPOINT ***\n'

  const workflowInstruction = options?.recoveryAttempt
    ? 'This is the recovery attempt: call only one of the preferred read-only tools. Do not make another mutation.\n'
    : 'If the requested UI workflow is not complete and fresh post-action evidence shows the last step succeeded, you may perform exactly one necessary next UI action. That action is progress, not verification, and will create a fresh checkpoint. Otherwise use a preferred read-only tool now.\n'

  return `${recoveryPrefix}A mutating Agent mode action just completed: ${strategy.mutatingToolNames.join(', ')}.
Reason: ${strategy.reason}
Required postconditions: ${strategy.postconditions.length > 0 ? strategy.postconditions.map(describePostcondition).join('; ') : 'No machine-checkable postcondition is available; require an explicit semanticOutcome verdict.'}
Use the safest read-only verification path now. Prefer these tools, in order: ${strategy.preferredTools.join(', ')}.
${workflowInstruction}Do not provide the final answer until the requested outcome is verified.
Verification must directly show the requested outcome, not merely that a tool ran. An unchanged image is not proof of success.
If verification fails, make at most one bounded recovery attempt. If it still cannot be verified, report the failure clearly instead of continuing blind.`
}

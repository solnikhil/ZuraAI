import type { ToolCallResult } from '../chat/types'

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
}

const READ_ONLY_TOOL_NAMES = new Set([
  'web_search',
  'file_read',
  'file_search',
  'app_find',
  'app_list',
  'window_list',
  'ui_get_app_state',
  'ui_find',
  'ui_wait_for',
  'windows_uia_snapshot',
  'computer_screenshot',
  'computer_list_windows',
])

const FILE_MUTATION_TOOLS = new Set(['file_write', 'file_move'])
const APP_WINDOW_MUTATION_PREFIXES = ['app_', 'window_', 'ui_', 'windows_uia_']
const APP_WINDOW_READ_ONLY_TOOLS = new Set([
  'app_find',
  'app_list',
  'window_list',
  'ui_get_app_state',
  'ui_find',
  'ui_wait_for',
  'windows_uia_snapshot',
])
const VISUAL_MUTATION_TOOLS = new Set([
  'ui_click',
  'ui_type_text',
  'ui_set_value',
  'ui_select',
  'ui_scroll',
  'ui_focus',
  'ui_key',
  'computer_click',
  'computer_type',
  'computer_key',
  'computer_scroll',
  'computer_cursor_position',
])

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

function isAppWindowMutation(toolName: string): boolean {
  if (APP_WINDOW_READ_ONLY_TOOLS.has(toolName)) return false
  return APP_WINDOW_MUTATION_PREFIXES.some((prefix) => toolName.startsWith(prefix))
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
  if (READ_ONLY_TOOL_NAMES.has(toolName)) return false
  if (FILE_MUTATION_TOOLS.has(toolName)) return true
  if (VISUAL_MUTATION_TOOLS.has(toolName)) return true
  if (toolName === 'system_shell') return result.toolCall.arguments?.mutatesState !== false
  if (isAppWindowMutation(toolName)) return true
  if (toolName.startsWith('mcp__')) return true
  return false
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
        }
      | undefined

    if (
      VISUAL_MUTATION_TOOLS.has(result.toolCall.name) &&
      data?.visualChange === 'changed' &&
      typeof data.screenshotId === 'string' &&
      data.screenshotId.length > 0
    ) {
      return true
    }

    return (
      isAppWindowMutation(result.toolCall.name) &&
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
      VISUAL_MUTATION_TOOLS.has(result.toolCall.name) &&
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
    }
  }

  const mutatingResults = (toolResults || []).filter(isSuccessfulMutatingResult)
  if (mutatingResults.length === 0) return null

  const mutatingToolNames = Array.from(
    new Set(mutatingResults.map((result) => result.toolCall.name))
  )

  if (mutatingToolNames.some((name) => FILE_MUTATION_TOOLS.has(name))) {
    return {
      category: 'file',
      reason: 'File changes were made and need a read-only filesystem check.',
      preferredTools: ['file_search', 'file_read'],
      mutatingToolNames,
    }
  }

  if (mutatingToolNames.some((name) => isAppWindowMutation(name))) {
    return {
      category: 'app-window',
      reason: 'App, window, or UI Automation state changed and needs a structured state check.',
      preferredTools: ['ui_get_app_state', 'ui_find', 'window_list'],
      mutatingToolNames,
    }
  }

  if (mutatingToolNames.some((name) => VISUAL_MUTATION_TOOLS.has(name))) {
    return {
      category: 'visual',
      reason: 'A visual Computer Use action changed the desktop and needs a targeted screenshot.',
      preferredTools: ['computer_screenshot'],
      mutatingToolNames,
    }
  }

  if (mutatingToolNames.some((name) => name === 'system_shell')) {
    return {
      category: 'shell',
      reason: 'A shell or code action changed state and needs output review or a read-only check.',
      preferredTools: ['file_search', 'file_read', 'window_list', 'ui_get_app_state'],
      mutatingToolNames,
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
  }
}

export function didVerificationSucceed(
  strategy: AgentVerificationStrategy,
  toolResults: ToolCallResult[] | undefined
): boolean {
  const allowedTools = new Set(strategy.preferredTools)
  return (toolResults || []).some((result) => {
    if (!result.result?.success || !allowedTools.has(result.toolCall.name)) return false
    const data = result.result.data as { visualChange?: unknown } | undefined
    return data?.visualChange !== 'unchanged'
  })
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
Use the safest read-only verification path now. Prefer these tools, in order: ${strategy.preferredTools.join(', ')}.
${workflowInstruction}Do not provide the final answer until the requested outcome is verified.
Verification must directly show the requested outcome, not merely that a tool ran. An unchanged image is not proof of success.
If verification fails, make at most one bounded recovery attempt. If it still cannot be verified, report the failure clearly instead of continuing blind.`
}

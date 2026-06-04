import type {
  AgentCapabilityState,
  AgentDesktopCapabilityState,
  AgentRun,
  AgentRunCapabilities,
  AgentStep,
  AssistantMode,
  ToolCallResult,
} from '../chat/types'
import { isMcpNamespacedToolName, type ToolCall } from '../tools/types'
import { isWindowsRuntime } from '../utils/platform'

const COMPUTER_TOOL_PREFIX = 'computer_'

/**
 * Capability description surfaced for the Agent_Desktop capability.
 *
 * Per Req 3.10, the agent's available capability description must document that
 * input is delivered only while the Agent_Desktop is the displayed
 * Virtual_Desktop, because all Virtual_Desktops belonging to one Windows user
 * share a single Input_Session. While the Agent_Desktop is in the background,
 * input actions are held until the user takes over and brings it to the
 * foreground.
 */
export const AGENT_DESKTOP_CAPABILITY_DESCRIPTION =
  'Agent Desktop runs agent windows on a dedicated Windows virtual desktop. Input ' +
  '(click, type, key, scroll, cursor) is delivered only while the Agent Desktop is the ' +
  'displayed virtual desktop, because all virtual desktops for one Windows user share a ' +
  'single input session; while the Agent Desktop is in the background, input is held until ' +
  'you take over and display it.'

/**
 * Inputs that determine the resolved {@link AgentDesktopCapabilityState}.
 * Mirrors the four-way combination from the design's Property 32
 * (`platform supported, VDA load outcome, skill enabled, session active`).
 */
export interface AgentDesktopCapabilityInput {
  /** True on Windows; false on macOS / other non-Windows platforms (Req 9.2). */
  platformSupported: boolean
  /** Whether the VirtualDesktopAccessor binding loaded successfully (Req 8.5). */
  vdaAvailable: boolean
  /** Whether the Agent_Desktop_Skill is enabled (Req 10.9, 11.1). */
  skillEnabled: boolean
  /** Whether an Agent_Desktop session is currently provisioned (Req 11.1). */
  sessionActive: boolean
}

/**
 * Pure resolution of the Agent_Desktop capability state (Req 11.1, 8.5, 9.2).
 *
 * Returns `unavailable` when the platform is unsupported, the VDA binding is
 * unavailable, or the skill is disabled; `active` when a session is
 * provisioned; otherwise `available`. Unavailable conditions take precedence
 * over `active` so a session can never report a usable state once the
 * capability has been lost.
 */
export function resolveAgentDesktopCapability(
  input: AgentDesktopCapabilityInput
): AgentDesktopCapabilityState {
  if (!input.platformSupported || !input.vdaAvailable || !input.skillEnabled) {
    return 'unavailable'
  }
  if (input.sessionActive) {
    return 'active'
  }
  return 'available'
}

export function isAgentWorkspaceMode(mode: AssistantMode): mode is 'agent' {
  return mode === 'agent'
}

export function buildAgentCapabilities(
  mode: AssistantMode,
  agentDesktop?: AgentDesktopCapabilityInput
): AgentRunCapabilities {
  const approvalRequired: AgentCapabilityState = 'approval-required'
  if (mode === 'agent') {
    // When the renderer has not yet resolved live Agent_Desktop state, default
    // to the safe disabled posture (Req 10.2): the skill is treated as off and
    // the VDA as unavailable, so the capability resolves to `unavailable` until
    // explicit state is supplied.
    const agentDesktopInput: AgentDesktopCapabilityInput = agentDesktop ?? {
      platformSupported: isWindowsRuntime(),
      vdaAvailable: false,
      skillEnabled: false,
      sessionActive: false,
    }
    return {
      web: approvalRequired,
      code: approvalRequired,
      mcp: approvalRequired,
      computer: isWindowsRuntime() ? approvalRequired : 'unavailable',
      agentDesktop: resolveAgentDesktopCapability(agentDesktopInput),
    }
  }

  return {
    web: 'unavailable',
    code: 'unavailable',
    mcp: 'unavailable',
    computer: 'unavailable',
    agentDesktop: 'unavailable',
  }
}

export function createAgentRun(
  mode: 'agent',
  agentDesktop?: AgentDesktopCapabilityInput
): AgentRun {
  const now = Date.now()
  return {
    id: `agent-run-${now}-${Math.random().toString(36).slice(2, 8)}`,
    mode,
    status: 'running',
    startedAt: now,
    capabilities: buildAgentCapabilities(mode, agentDesktop),
    steps: [
      {
        id: `agent-step-plan-${now}`,
        kind: 'plan',
        status: 'completed',
        title: 'Agent mode started',
        summary: 'Read-only tools run automatically. Mutating tools require approval unless trusted.',
        startedAt: now,
        completedAt: now,
        durationMs: 0,
        approvalState: 'not-required',
      },
    ],
  }
}

export function getToolStepKind(toolName: string): AgentStep['kind'] {
  if (toolName === 'web_search') return 'web'
  if (toolName === 'code_execution') return 'code'
  if (toolName.startsWith(COMPUTER_TOOL_PREFIX)) return 'computer'
  if (isMcpNamespacedToolName(toolName)) return 'mcp'
  return 'tool'
}

export function describeToolCall(toolCall: ToolCall): { title: string; summary: string } {
  const args = toolCall.arguments || {}
  if (toolCall.name === 'web_search') {
    return {
      title: 'Search web',
      summary: String(args.query || 'Preparing search query'),
    }
  }
  if (toolCall.name === 'code_execution') {
    return {
      title: 'Run code',
      summary: String(args.description || args.language || 'Execute sandboxed code'),
    }
  }
  if (toolCall.name.startsWith(COMPUTER_TOOL_PREFIX)) {
    return {
      title: formatComputerToolTitle(toolCall.name),
      summary: summarizeArguments(args),
    }
  }
  if (isMcpNamespacedToolName(toolCall.name)) {
    return {
      title: 'Run MCP tool',
      summary: toolCall.name,
    }
  }
  return {
    title: toolCall.name.replace(/_/g, ' '),
    summary: summarizeArguments(args),
  }
}

export function upsertAgentToolStep(
  run: AgentRun,
  toolCall: ToolCall,
  update: Partial<AgentStep>
): AgentRun {
  const now = Date.now()
  const existing = run.steps.find((step) => step.toolCallId === toolCall.id)
  const description = describeToolCall(toolCall)
  const nextStep: AgentStep = {
    id: existing?.id ?? `agent-step-${toolCall.id || now}`,
    kind: getToolStepKind(toolCall.name),
    status: existing?.status ?? 'pending',
    title: description.title,
    summary: description.summary,
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    arguments: toolCall.arguments,
    startedAt: existing?.startedAt,
    ...existing,
    ...update,
  }

  const steps = existing
    ? run.steps.map((step) => (step.id === existing.id ? nextStep : step))
    : [...run.steps, nextStep]

  return {
    ...run,
    steps,
  }
}

export function completeAgentToolStep(run: AgentRun, result: ToolCallResult): AgentRun {
  const now = Date.now()
  const existing = run.steps.find((step) => step.toolCallId === result.toolCall.id)
  const startedAt = existing?.startedAt ?? now
  const rejected = result.result?.error?.toLowerCase().includes('rejected')
  return upsertAgentToolStep(run, result.toolCall, {
    status: result.result?.success ? 'completed' : rejected ? 'rejected' : 'failed',
    result: result.result,
    startedAt,
    completedAt: now,
    durationMs: result.result?.executionTime ?? Math.max(0, now - startedAt),
    approvalState:
      existing?.approvalState === 'pending'
        ? result.result?.success
          ? 'approved'
          : rejected
            ? 'rejected'
            : 'cancelled'
        : existing?.approvalState,
  })
}

export function finishAgentRun(
  run: AgentRun | undefined,
  status: AgentRun['status']
): AgentRun | undefined {
  if (!run) return undefined
  return {
    ...run,
    status,
    completedAt: Date.now(),
  }
}

function formatComputerToolTitle(toolName: string): string {
  return toolName
    .replace(/^computer_/, '')
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function summarizeArguments(args: Record<string, unknown>): string {
  const entries = Object.entries(args)
  if (entries.length === 0) return 'No arguments'
  return entries
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${String(value).slice(0, 60)}`)
    .join(', ')
}

import type {
  AgentCapabilityState,
  AgentRun,
  AgentRunCapabilities,
  AgentStep,
  AssistantMode,
  ToolCallResult,
} from '../chat/types'
import { isMcpNamespacedToolName, type ToolCall } from '../tools/types'
import { isWindowsRuntime } from '../utils/platform'

const COMPUTER_TOOL_PREFIX = 'computer_'

export function isAgentWorkspaceMode(mode: AssistantMode): mode is 'agent' {
  return mode === 'agent'
}

export function buildAgentCapabilities(mode: AssistantMode): AgentRunCapabilities {
  const approvalRequired: AgentCapabilityState = 'approval-required'
  if (mode === 'agent') {
    return {
      web: approvalRequired,
      code: approvalRequired,
      mcp: approvalRequired,
      computer: isWindowsRuntime() ? approvalRequired : 'unavailable',
    }
  }

  return {
    web: 'unavailable',
    code: 'unavailable',
    mcp: 'unavailable',
    computer: 'unavailable',
  }
}

export function createAgentRun(mode: 'agent'): AgentRun {
  const now = Date.now()
  return {
    id: `agent-run-${now}-${Math.random().toString(36).slice(2, 8)}`,
    mode,
    status: 'running',
    startedAt: now,
    capabilities: buildAgentCapabilities(mode),
    steps: [
      {
        id: `agent-step-plan-${now}`,
        kind: 'plan',
        status: 'completed',
        title: 'Agent workspace started',
        summary: 'Tools are available after manual approval for each action.',
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

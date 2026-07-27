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
import { buildAgentPlanPrompt, type AgentVerificationStrategy } from './reliability'

const COMPUTER_TOOL_PREFIX = 'computer_'

function sanitizeVerificationPostconditions(strategy: AgentVerificationStrategy) {
  return strategy.postconditions.map((postcondition) => {
    if (postcondition.kind === 'file-content') {
      return {
        kind: postcondition.kind,
        path: postcondition.path,
        expectedLength: postcondition.expectedContent.length,
      }
    }
    if (postcondition.kind === 'ui-value') {
      return {
        kind: postcondition.kind,
        elementId: postcondition.elementId,
        expectedLength: postcondition.expectedValue.length,
      }
    }
    return postcondition
  })
}

function sanitizeToolArguments(args: ToolCall['arguments']): Record<string, unknown> {
  if (!args || typeof args !== 'object') return {}
  return {
    argumentKeys: Object.keys(args)
      .filter((key) => !key.startsWith('_'))
      .sort()
      .slice(0, 24),
  }
}

function sanitizeToolResult(result: ToolCallResult['result']): Record<string, unknown> | undefined {
  if (!result) return undefined
  return {
    success: result.success,
    ...(result.error ? { hasError: true } : {}),
    ...(typeof result.executionTime === 'number' ? { executionTime: result.executionTime } : {}),
  }
}

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

export function createAgentRun(mode: 'agent', taskText?: string, runId?: string): AgentRun {
  const now = Date.now()
  const plan = buildAgentPlanPrompt(taskText)
  return {
    // Share the trusted ChatRunController identity so renderer progress and the main-owned
    // budget/cancellation ledger address the same run.
    id: runId ?? `agent-run-${now}-${Math.random().toString(36).slice(2, 8)}`,
    mode,
    status: 'running',
    phase: 'discover',
    verification: 'not-required',
    startedAt: now,
    capabilities: buildAgentCapabilities(mode),
    steps: [
      {
        id: `agent-step-plan-${now}`,
        kind: 'plan',
        status: 'completed',
        title: 'Plan agent task',
        summary: `Goal: ${plan.goal}`,
        arguments: {
          goal: plan.goal,
          intendedToolPath: plan.intendedToolPath,
          expectedOutcome: plan.expectedOutcome,
          verificationMethod: plan.verificationMethod,
        },
        startedAt: now,
        completedAt: now,
        durationMs: 0,
        approvalState: 'not-required',
      },
    ],
  }
}

export function upsertAgentVerificationStep(
  run: AgentRun,
  strategy: AgentVerificationStrategy,
  update: Partial<AgentStep>
): AgentRun {
  const existing = [...run.steps]
    .reverse()
    .find(
      (step) => step.kind === 'verify' && step.status !== 'completed' && step.status !== 'failed'
    )
  const now = Date.now()
  const nextStep: AgentStep = {
    id: existing?.id ?? `agent-step-verify-${now}`,
    kind: 'verify',
    status: existing?.status ?? 'pending',
    title: 'Verify changes',
    summary: strategy.reason,
    arguments: {
      category: strategy.category,
      preferredTools: strategy.preferredTools,
      mutatingToolNames: strategy.mutatingToolNames,
      postconditions: sanitizeVerificationPostconditions(strategy),
    },
    startedAt: existing?.startedAt,
    approvalState: 'not-required',
    ...existing,
    ...update,
  }

  const steps = existing
    ? run.steps.map((step) => (step.id === existing.id ? nextStep : step))
    : [...run.steps, nextStep]

  const verification = update.verificationOutcome
    ? update.verificationOutcome
    : update.status === 'running' || update.status === 'pending'
      ? 'pending'
      : update.status === 'completed'
        ? 'verified'
        : update.status === 'failed'
          ? 'inconclusive'
          : run.verification

  return { ...run, phase: 'verify', verification, steps }
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
      summary: summarizeArguments(args),
    }
  }
  if (toolCall.name === 'code_execution') {
    return {
      title: 'Run code',
      summary: summarizeArguments(args),
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
    // The durable run ledger records shape, not sensitive values. Full tool data already has its
    // own visibility/persistence path and must not be duplicated into AgentRun diagnostics.
    arguments: sanitizeToolArguments(toolCall.arguments),
    startedAt: existing?.startedAt,
    ...existing,
    ...update,
  }

  const steps = existing
    ? run.steps.map((step) => (step.id === existing.id ? nextStep : step))
    : [...run.steps, nextStep]

  return {
    ...run,
    phase: 'act',
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
    result: sanitizeToolResult(result.result),
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
  const verification = resolveAgentRunVerification(run)
  const truthfulStatus =
    status === 'completed' && verification === 'inconclusive'
      ? 'completed_unverified'
      : status === 'completed' && (verification === 'pending' || verification === 'contradicted')
        ? 'failed'
        : status
  return {
    ...run,
    status: truthfulStatus,
    phase: 'report',
    verification,
    completedAt: Date.now(),
  }
}

/** Infer evidence state for older persisted runs that predate the orthogonal field. */
export function resolveAgentRunVerification(run: AgentRun): AgentRun['verification'] {
  if (run.verification) return run.verification
  const verificationSteps = run.steps.filter((step) => step.kind === 'verify')
  const latest = verificationSteps.at(-1)
  if (!latest) return 'not-required'
  if (latest.verificationOutcome) return latest.verificationOutcome
  if (latest.status === 'completed') return 'verified'
  if (latest.status === 'failed') return 'inconclusive'
  return 'pending'
}

function formatComputerToolTitle(toolName: string): string {
  return toolName
    .replace(/^computer_/, '')
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function summarizeArguments(args: Record<string, unknown>): string {
  const keys = Object.keys(args)
    .filter((key) => !key.startsWith('_'))
    .sort()
    .slice(0, 3)
  return keys.length === 0 ? 'No arguments' : `Inputs: ${keys.join(', ')}`
}

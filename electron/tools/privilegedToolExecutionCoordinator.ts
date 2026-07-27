import { agentRunRegistry, type BeginAgentToolResult } from './agent-run/registry'
import { consumeToolApprovalAuthorization } from './toolApprovalAuthorizations'

const RUN_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

type AgentRunDenialReason = Extract<BeginAgentToolResult, { ok: false }>['reason']

export interface PrivilegedToolExecutionRequest {
  senderWebContentsId: number
  toolName: string
  args: Record<string, unknown>
  approvalToken?: string
  runId?: string
  mutating: boolean
  signal?: AbortSignal
}

export interface PrivilegedToolExecutionContext {
  approved: boolean
  signal?: AbortSignal
}

export type PrivilegedToolExecutionResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: AgentRunDenialReason }

interface ExecutionCoordinatorDependencies {
  beginTool: typeof agentRunRegistry.beginTool
  completeTool: typeof agentRunRegistry.completeTool
  consumeApproval: typeof consumeToolApprovalAuthorization
}

/**
 * Main-only lifecycle boundary shared by built-in and MCP tool dispatch.
 *
 * Tool schemas, approval presentation, and mutation classification remain with their owning
 * registries. This coordinator only consumes exact authorization, accounts an optional Agent run,
 * composes cancellation, and guarantees matching completion after a successful begin.
 */
export class PrivilegedToolExecutionCoordinator {
  constructor(
    private readonly dependencies: ExecutionCoordinatorDependencies = {
      beginTool: agentRunRegistry.beginTool.bind(agentRunRegistry),
      completeTool: agentRunRegistry.completeTool.bind(agentRunRegistry),
      consumeApproval: consumeToolApprovalAuthorization,
    }
  ) {}

  async execute<T>(
    request: PrivilegedToolExecutionRequest,
    callback: (context: PrivilegedToolExecutionContext) => Promise<T>
  ): Promise<PrivilegedToolExecutionResult<T>> {
    this.assertRequest(request)
    const approved = this.dependencies.consumeApproval(
      request.approvalToken,
      request.senderWebContentsId,
      request.toolName,
      request.args
    )

    if (!request.runId) {
      return {
        ok: true,
        value: await callback({ approved, signal: request.signal }),
      }
    }

    const permit = this.dependencies.beginTool(request.runId, request.senderWebContentsId, {
      mutating: request.mutating,
    })
    if (!permit.ok) return permit

    const composed = composeAbortSignals(permit.signal, request.signal)
    try {
      return {
        ok: true,
        value: await callback({ approved, signal: composed.signal }),
      }
    } finally {
      composed.dispose()
      this.dependencies.completeTool(request.runId, request.senderWebContentsId)
    }
  }

  private assertRequest(request: PrivilegedToolExecutionRequest): void {
    if (
      !Number.isInteger(request.senderWebContentsId) ||
      ((request.runId !== undefined || request.approvalToken !== undefined) &&
        request.senderWebContentsId < 0)
    ) {
      throw new Error('Invalid privileged tool sender.')
    }
    if (!request.toolName) throw new Error('Invalid privileged tool name.')
    if (request.runId !== undefined && !RUN_ID_PATTERN.test(request.runId)) {
      throw new Error('Invalid tool execution run id.')
    }
  }
}

function composeAbortSignals(
  runSignal: AbortSignal,
  additionalSignal?: AbortSignal
): { signal: AbortSignal; dispose: () => void } {
  if (!additionalSignal || additionalSignal === runSignal) {
    return { signal: runSignal, dispose: () => undefined }
  }

  const controller = new AbortController()
  const abortFrom = (signal: AbortSignal) => {
    if (!controller.signal.aborted) controller.abort(signal.reason)
  }
  const onRunAbort = () => abortFrom(runSignal)
  const onAdditionalAbort = () => abortFrom(additionalSignal)
  runSignal.addEventListener('abort', onRunAbort, { once: true })
  additionalSignal.addEventListener('abort', onAdditionalAbort, { once: true })
  if (runSignal.aborted) abortFrom(runSignal)
  else if (additionalSignal.aborted) abortFrom(additionalSignal)

  return {
    signal: controller.signal,
    dispose: () => {
      runSignal.removeEventListener('abort', onRunAbort)
      additionalSignal.removeEventListener('abort', onAdditionalAbort)
    },
  }
}

export const privilegedToolExecutionCoordinator = new PrivilegedToolExecutionCoordinator()

import { execFile } from 'child_process'
import fs from 'fs/promises'
import path from 'path'

import type { ToolHandlerContext, ToolResult } from '../types'
import { boolArg, isRecord, stringArg, truncateOutput } from '../native-common'
import type { TerminalApprovalManager } from '../terminal/approvalManager'
import {
  TERMINAL_APPROVAL_TIMEOUT_MS,
  TERMINAL_DEFAULT_TIMEOUT_MS,
  TERMINAL_MAX_TIMEOUT_MS,
} from '../terminal/constants'

let approvalManager: TerminalApprovalManager | null = null

export function setApprovalManager(manager: TerminalApprovalManager): void {
  approvalManager = manager
}

/**
 * Terminal-specific timeout clamp. Allows a higher cap than the shared native
 * tool cap (MAX_NATIVE_TIMEOUT_MS) since shell commands frequently run builds
 * or installs. Output is still truncated by truncateOutput.
 */
function clampTerminalTimeoutMs(value: unknown, fallback = TERMINAL_DEFAULT_TIMEOUT_MS): number {
  const parsed =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : fallback
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(TERMINAL_MAX_TIMEOUT_MS, Math.max(1_000, Math.round(parsed)))
}

interface PowerShellResult {
  stdout: string
  stderr: string
  exitCode: number | null
  timedOut: boolean
  aborted: boolean
}

function terminateProcessTree(child: { pid?: number; kill: () => boolean }): void {
  if (process.platform === 'win32' && Number.isSafeInteger(child.pid) && (child.pid ?? 0) > 0) {
    execFile(
      'taskkill.exe',
      ['/pid', String(child.pid), '/T', '/F'],
      { windowsHide: true },
      () => undefined
    )
    return
  }
  child.kill()
}

/**
 * Exit-code-aware PowerShell runner. Unlike the shared runPowerShell helper,
 * a non-zero exit code does NOT reject — it resolves with the captured exit
 * code plus stdout/stderr so the model can read the failure and self-correct.
 */
function runPowerShellWithExitCode(
  script: string,
  options: { cwd?: string; timeoutMs: number; signal?: AbortSignal }
): Promise<PowerShellResult> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      resolve({ stdout: '', stderr: '', exitCode: null, timedOut: false, aborted: true })
      return
    }

    let aborted = false
    const child = execFile(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        script,
      ],
      {
        cwd: options.cwd,
        timeout: options.timeoutMs,
        windowsHide: true,
        maxBuffer: 20_000 * 4,
      },
      (error, stdout, stderr) => {
        options.signal?.removeEventListener('abort', abort)
        const out = truncateOutput(stdout ?? '')
        const err = truncateOutput(stderr ?? '')

        if (aborted) {
          resolve({ stdout: out, stderr: err, exitCode: null, timedOut: false, aborted: true })
          return
        }

        if (error) {
          const errWithMeta = error as NodeJS.ErrnoException & {
            code?: number | string
            killed?: boolean
            signal?: string
          }
          // execFile sets `killed` true and signal on timeout.
          if (errWithMeta.killed) {
            resolve({ stdout: out, stderr: err, exitCode: null, timedOut: true, aborted: false })
            return
          }
          // Non-zero exit: error.code is the numeric exit code.
          if (typeof errWithMeta.code === 'number') {
            resolve({
              stdout: out,
              stderr: err,
              exitCode: errWithMeta.code,
              timedOut: false,
              aborted: false,
            })
            return
          }
          // Failure to spawn (e.g. powershell.exe missing): genuine reject.
          reject(new Error(err.trim() || error.message))
          return
        }

        resolve({ stdout: out, stderr: err, exitCode: 0, timedOut: false, aborted: false })
      }
    )
    const abort = () => {
      aborted = true
      terminateProcessTree(child)
    }
    options.signal?.addEventListener('abort', abort, { once: true })
  })
}

export async function executeSystemShell(
  args: unknown,
  context?: ToolHandlerContext
): Promise<ToolResult> {
  const cancelledResult = (): ToolResult => ({
    success: false,
    error: 'Terminal command cancelled with the Agent run.',
  })
  if (context?.signal?.aborted) return cancelledResult()

  const command = stringArg(args, 'command')
  if (!command) return { success: false, error: 'command is required.' }

  const description = stringArg(args, 'description')
  if (!description) return { success: false, error: 'description is required.' }

  const cwd = stringArg(args, 'cwd')
  const timeoutMs = clampTerminalTimeoutMs(isRecord(args) ? args.timeoutMs : undefined)
  const resolvedCwd = cwd ? path.resolve(cwd) : undefined

  // Approval gate — blocks until the user approves, rejects, or it times out.
  // `autoApprove` is internal-only and is added by the execute-tool boundary only
  // after it consumes a main-issued authorization bound to this exact invocation.
  if (approvalManager && !boolArg(args, 'autoApprove')) {
    const decision = await approvalManager.requestApproval({
      command,
      cwd: resolvedCwd ?? process.cwd(),
      description,
      timeoutMs: TERMINAL_APPROVAL_TIMEOUT_MS,
    })
    if (!decision.approved) {
      const reason =
        decision.outcome === 'timed_out'
          ? 'Terminal command approval timed out.'
          : 'Terminal command was rejected by the user.'
      return { success: false, error: reason }
    }
    if (context?.signal?.aborted) return cancelledResult()
  }

  try {
    if (resolvedCwd) {
      const stat = await fs.stat(resolvedCwd)
      if (!stat.isDirectory()) {
        return { success: false, error: 'cwd must point to an existing directory.' }
      }
    }

    const { stdout, stderr, exitCode, timedOut, aborted } = await runPowerShellWithExitCode(
      command,
      {
        cwd: resolvedCwd,
        timeoutMs,
        signal: context?.signal,
      }
    )

    if (aborted) {
      return {
        success: false,
        error: 'Terminal command cancelled with the Agent run.',
        data: { command, cwd: resolvedCwd ?? process.cwd(), stdout, stderr, exitCode: null },
      }
    }

    if (timedOut) {
      return {
        success: false,
        error: `Terminal command timed out after ${Math.round(timeoutMs / 1000)}s.`,
        data: {
          command,
          cwd: resolvedCwd ?? process.cwd(),
          stdout,
          stderr,
          exitCode: null,
        },
      }
    }

    const succeeded = exitCode === 0
    return {
      success: succeeded,
      ...(!succeeded ? { error: `Terminal command exited with code ${exitCode}.` } : {}),
      data: {
        command,
        cwd: resolvedCwd ?? process.cwd(),
        stdout,
        stderr,
        exitCode,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'PowerShell command failed.',
    }
  }
}

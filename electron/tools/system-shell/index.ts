import { execFile } from 'child_process'
import fs from 'fs/promises'
import path from 'path'

import type { ToolResult } from '../types'
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
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : fallback
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(TERMINAL_MAX_TIMEOUT_MS, Math.max(1_000, Math.round(parsed)))
}

interface PowerShellResult {
  stdout: string
  stderr: string
  exitCode: number | null
  timedOut: boolean
}

/**
 * Exit-code-aware PowerShell runner. Unlike the shared runPowerShell helper,
 * a non-zero exit code does NOT reject — it resolves with the captured exit
 * code plus stdout/stderr so the model can read the failure and self-correct.
 */
function runPowerShellWithExitCode(
  script: string,
  options: { cwd?: string; timeoutMs: number }
): Promise<PowerShellResult> {
  return new Promise((resolve, reject) => {
    execFile(
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
        const out = truncateOutput(stdout ?? '')
        const err = truncateOutput(stderr ?? '')

        if (error) {
          const errWithMeta = error as NodeJS.ErrnoException & { code?: number | string; killed?: boolean; signal?: string }
          // execFile sets `killed` true and signal on timeout.
          if (errWithMeta.killed) {
            resolve({ stdout: out, stderr: err, exitCode: null, timedOut: true })
            return
          }
          // Non-zero exit: error.code is the numeric exit code.
          if (typeof errWithMeta.code === 'number') {
            resolve({ stdout: out, stderr: err, exitCode: errWithMeta.code, timedOut: false })
            return
          }
          // Failure to spawn (e.g. powershell.exe missing): genuine reject.
          reject(new Error(err.trim() || error.message))
          return
        }

        resolve({ stdout: out, stderr: err, exitCode: 0, timedOut: false })
      }
    )
  })
}

export async function executeSystemShell(args: unknown): Promise<ToolResult> {
  const command = stringArg(args, 'command')
  if (!command) return { success: false, error: 'command is required.' }

  const description = stringArg(args, 'description')
  if (!description) return { success: false, error: 'description is required.' }

  const cwd = stringArg(args, 'cwd')
  const timeoutMs = clampTerminalTimeoutMs(isRecord(args) ? args.timeoutMs : undefined)
  const resolvedCwd = cwd ? path.resolve(cwd) : undefined

  // Approval gate — blocks until the user approves, rejects, or it times out.
  // The `autoApprove` fast-path lets agent-mode (which already approved in the
  // renderer) and the terminalAutoApprove opt-in skip the main-process prompt.
  if (approvalManager && !boolArg(args, 'autoApprove')) {
    const decision = await approvalManager.requestApproval({
      command,
      cwd: resolvedCwd ?? process.cwd(),
      description,
      timeoutMs: TERMINAL_APPROVAL_TIMEOUT_MS,
    })
    if (!decision.approved) {
      const reason = decision.outcome === 'timed_out'
        ? 'Terminal command approval timed out.'
        : 'Terminal command was rejected by the user.'
      return { success: false, error: reason }
    }
  }

  try {
    if (resolvedCwd) {
      const stat = await fs.stat(resolvedCwd)
      if (!stat.isDirectory()) {
        return { success: false, error: 'cwd must point to an existing directory.' }
      }
    }

    const { stdout, stderr, exitCode, timedOut } = await runPowerShellWithExitCode(command, {
      cwd: resolvedCwd,
      timeoutMs,
    })

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

    return {
      success: true,
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

import fs from 'fs/promises'
import path from 'path'

import type { ToolResult } from '../types'
import {
  clampTimeoutMs,
  isRecord,
  requireApproval,
  runPowerShell,
  stringArg,
  truncateOutput,
} from '../native-common'

export async function executeSystemShell(args: unknown): Promise<ToolResult> {
  const approval = requireApproval(args, 'system_shell')
  if (approval) return approval

  const command = stringArg(args, 'command')
  if (!command) return { success: false, error: 'command is required.' }

  const description = stringArg(args, 'description')
  if (!description) return { success: false, error: 'description is required.' }

  const cwd = stringArg(args, 'cwd')
  const timeoutMs = clampTimeoutMs(isRecord(args) ? args.timeoutMs : undefined)
  const resolvedCwd = cwd ? path.resolve(cwd) : undefined

  try {
    if (resolvedCwd) {
      const stat = await fs.stat(resolvedCwd)
      if (!stat.isDirectory()) {
        return { success: false, error: 'cwd must point to an existing directory.' }
      }
    }
    const { stdout, stderr } = await runPowerShell(command, {
      cwd: resolvedCwd,
      timeoutMs,
    })
    return {
      success: true,
      data: {
        command,
        cwd: resolvedCwd ?? process.cwd(),
        stdout: truncateOutput(stdout),
        stderr: truncateOutput(stderr),
      },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'PowerShell command failed.',
    }
  }
}

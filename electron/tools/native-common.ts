import { execFile } from 'child_process'

import type { ToolResult } from './types'

export const DEFAULT_NATIVE_TIMEOUT_MS = 15_000
export const MAX_NATIVE_TIMEOUT_MS = 60_000
export const MAX_NATIVE_OUTPUT_LENGTH = 20_000

export function isWindows(): boolean {
  return process.platform === 'win32'
}

export function unsupportedWindowsOnly(toolName: string): ToolResult {
  return {
    success: false,
    error: `${toolName} is only supported on Windows.`,
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function stringArg(args: unknown, key: string): string {
  if (!isRecord(args)) return ''
  const value = args[key]
  return typeof value === 'string' ? value.trim() : ''
}

export function numberArg(args: unknown, key: string): number | undefined {
  if (!isRecord(args)) return undefined
  const value = args[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

export function boolArg(args: unknown, key: string): boolean {
  return isRecord(args) && args[key] === true
}

export function requireApproval(args: unknown, action: string): ToolResult | null {
  if (boolArg(args, 'autoApprove')) {
    return null
  }
  return {
    success: false,
    error: `${action} requires user approval before it can run.`,
  }
}

export function clampTimeoutMs(value: unknown, fallback = DEFAULT_NATIVE_TIMEOUT_MS): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : fallback
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(MAX_NATIVE_TIMEOUT_MS, Math.max(1_000, Math.round(parsed)))
}

export function truncateOutput(value: string, max = MAX_NATIVE_OUTPUT_LENGTH): string {
  return value.length > max ? `${value.slice(0, max)}\n...[truncated]` : value
}

export function runPowerShell(
  script: string,
  options: { cwd?: string; timeoutMs?: number } = {}
): Promise<{ stdout: string; stderr: string }> {
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
        timeout: options.timeoutMs ?? DEFAULT_NATIVE_TIMEOUT_MS,
        windowsHide: true,
        maxBuffer: MAX_NATIVE_OUTPUT_LENGTH * 4,
      },
      (error, stdout, stderr) => {
        if (error) {
          const message = stderr?.trim() || error.message
          reject(new Error(message))
          return
        }
        resolve({
          stdout: truncateOutput(stdout ?? ''),
          stderr: truncateOutput(stderr ?? ''),
        })
      }
    )
  })
}

export function parseJsonOutput<T>(stdout: string): T {
  const trimmed = stdout.trim()
  if (!trimmed) {
    throw new Error('Command returned no JSON output.')
  }
  return JSON.parse(trimmed) as T
}

export function normalizeJsonArray<T>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value
  if (value === null || value === undefined) return []
  return [value]
}

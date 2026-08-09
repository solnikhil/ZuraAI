import type { ToolResult } from '../types'
import type { CodeExecutionArgs, OnlineCompilerResponse } from './types'
import type { CodeExecutionApprovalManager } from './approvalManager'
import { getSecureValueAsync } from '../../secureStorage'
import {
  ONLINE_COMPILER_API_URL,
  ONLINE_COMPILER_FETCH_TIMEOUT_MS,
  COMPILER_MAP,
  EXEC_MAX_CODE_LENGTH,
  EXEC_MAX_OUTPUT_LENGTH,
} from './constants'

let approvalManager: CodeExecutionApprovalManager | null = null

export function setApprovalManager(manager: CodeExecutionApprovalManager): void {
  approvalManager = manager
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) + '\n...[truncated]' : value
}

function optionalString(value: unknown): string | null {
  if (value === undefined || value === null) return ''
  return typeof value === 'string' ? value : null
}

/**
 * Validates an OnlineCompiler payload against its documented shape.
 *
 * Returns `null` when the response cannot be interpreted, so a malformed body
 * is surfaced as a failure rather than silently read as an empty successful run.
 */
function parseOnlineCompilerResponse(payload: unknown): OnlineCompilerResponse | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null
  const record = payload as Record<string, unknown>

  const output = optionalString(record.output)
  const error = optionalString(record.error)
  if (output === null || error === null) return null

  if (record.status !== 'success' && record.status !== 'error') return null

  const exitCode = record.exit_code
  if (exitCode !== null && exitCode !== undefined && typeof exitCode !== 'number') return null

  const signal = record.signal
  if (signal !== null && signal !== undefined && typeof signal !== 'number') return null

  return {
    output,
    error,
    status: record.status,
    exit_code: typeof exitCode === 'number' ? exitCode : null,
    signal: typeof signal === 'number' ? signal : null,
    time: typeof record.time === 'string' ? record.time : '',
    total: typeof record.total === 'string' ? record.total : '',
    memory: typeof record.memory === 'string' ? record.memory : '',
  }
}

/**
 * Describes why an execution failed, or `null` when it genuinely succeeded.
 *
 * Success requires the documented success status together with a zero or absent
 * exit code. A non-zero exit code is a failure even when the API reports
 * `status: "success"`, because the process itself did not succeed.
 */
function describeExecutionFailure(result: OnlineCompilerResponse): string | null {
  if (result.status !== 'success') {
    const detail = result.error.trim() || result.output.trim()
    return detail
      ? `Code execution failed: ${truncate(detail, EXEC_MAX_OUTPUT_LENGTH)}`
      : 'Code execution failed without a reported error message.'
  }

  if (typeof result.signal === 'number' && result.signal !== 0) {
    return `Code execution was terminated by signal ${result.signal}.`
  }

  if (typeof result.exit_code === 'number' && result.exit_code !== 0) {
    const detail = result.error.trim()
    return detail
      ? `Code exited with status ${result.exit_code}: ${truncate(detail, EXEC_MAX_OUTPUT_LENGTH)}`
      : `Code exited with status ${result.exit_code}.`
  }

  return null
}

export async function executeCode(args: CodeExecutionArgs): Promise<ToolResult> {
  const { code, language } = args

  if (!code || typeof code !== 'string' || !code.trim()) {
    return { success: false, error: 'Code is required and cannot be empty.' }
  }

  if (code.length > EXEC_MAX_CODE_LENGTH) {
    return {
      success: false,
      error: `Code exceeds maximum length of ${EXEC_MAX_CODE_LENGTH} characters.`,
    }
  }

  const compilerEntry = COMPILER_MAP[language]
  if (!compilerEntry) {
    return {
      success: false,
      error: `Unsupported language: ${String(language)}. Use "javascript" or "python".`,
    }
  }

  const apiKey = await getSecureValueAsync('onlineCompilerApiKey')
  if (!apiKey) {
    return {
      success: false,
      error:
        'OnlineCompiler API key required. Add one in Settings → Provider Hub (free at onlinecompiler.io).',
    }
  }

  // Approval gate — blocks until user approves, rejects, or timeout
  if (approvalManager && !args.autoApprove) {
    const decision = await approvalManager.requestApproval({ code, language })
    if (!decision.approved) {
      const reason =
        decision.outcome === 'timed_out'
          ? 'Code execution approval timed out.'
          : 'Code execution was rejected by the user.'
      return { success: false, error: reason }
    }
  }

  const body = {
    compiler: compilerEntry.compiler,
    code,
    input: '',
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), ONLINE_COMPILER_FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(ONLINE_COMPILER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (response.status === 401) {
      return {
        success: false,
        error: 'Invalid OnlineCompiler API key. Check your key in Settings → Provider Hub.',
      }
    }

    if (response.status === 429) {
      return {
        success: false,
        error:
          'OnlineCompiler rate limit reached. Try again later or check your plan at onlinecompiler.io.',
      }
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      return {
        success: false,
        error: `OnlineCompiler API error: ${response.status} ${text.slice(0, 200)}`,
      }
    }

    const payload = (await response.json().catch(() => undefined)) as unknown
    const result = parseOnlineCompilerResponse(payload)
    if (!result) {
      return {
        success: false,
        error: 'OnlineCompiler returned a malformed response that could not be interpreted.',
      }
    }

    const stdout = truncate(result.output, EXEC_MAX_OUTPUT_LENGTH)
    const stderr = truncate(result.error, EXEC_MAX_OUTPUT_LENGTH)
    const exitCode = result.exit_code

    const data = {
      stdout,
      stderr,
      exitCode,
      language,
      executionTime: result.time,
      executionOutput: stdout,
    }

    // A reachable API does not mean the code ran successfully. Compile errors
    // and runtime failures must not be reported as a successful execution, or
    // the tool loop and Agent verification will treat them as a working result.
    const failure = describeExecutionFailure(result)
    if (failure) {
      return { success: false, error: failure, data }
    }

    return { success: true, data }
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        success: false,
        error: 'Code execution request timed out. The OnlineCompiler API did not respond in time.',
      }
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during code execution.',
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

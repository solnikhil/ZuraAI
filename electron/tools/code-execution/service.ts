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

    const result = (await response.json()) as OnlineCompilerResponse

    const stdout = truncate(result.output || '', EXEC_MAX_OUTPUT_LENGTH)
    const stderr = truncate(result.error || '', EXEC_MAX_OUTPUT_LENGTH)
    const exitCode = result.exit_code

    return {
      success: true,
      data: {
        stdout,
        stderr,
        exitCode,
        language,
        executionTime: result.time,
        executionOutput: stdout,
      },
    }
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

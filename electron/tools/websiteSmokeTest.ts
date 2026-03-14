import type { ToolResult } from './types'
import { executeWebsiteSmokeTestRun } from '../testing/runner'
import { validateWebsiteSmokeTestInput } from '../testing/validation'

export async function executeWebsiteSmokeTest(rawArgs: unknown): Promise<ToolResult> {
  try {
    const input = validateWebsiteSmokeTestInput(rawArgs)
    const record = await executeWebsiteSmokeTestRun(input)

    return {
      success: true,
      data: record.result,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Website smoke test failed.',
    }
  }
}

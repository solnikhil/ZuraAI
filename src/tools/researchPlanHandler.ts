/**
 * Research Plan Handler - Expands research_plan tool calls into multiple web_search executions
 * Handled in renderer; does NOT invoke IPC for research_plan directly.
 * Each step is executed via executeTool('web_search', ...) which goes to main process.
 */

import { executeTool } from './executor'
import type { ToolCall, ToolCallResult, ToolResult } from './types'

export interface ResearchPlanStep {
  stepNumber: number
  query: string
  rationale?: string
}

export interface ResearchPlanArgs {
  topic: string
  steps: ResearchPlanStep[]
}

function parseResearchPlanArgs(args: Record<string, unknown>): ResearchPlanArgs | null {
  const topic = typeof args.topic === 'string' ? args.topic.trim() : ''
  const rawSteps = args.steps
  if (!topic || !Array.isArray(rawSteps) || rawSteps.length === 0) {
    return null
  }

  const steps: ResearchPlanStep[] = rawSteps
    .filter((s): s is Record<string, unknown> => s != null && typeof s === 'object')
    .filter(s => typeof s.stepNumber === 'number' && typeof s.query === 'string')
    .map((s, i) => ({
      stepNumber: typeof s.stepNumber === 'number' ? s.stepNumber : i + 1,
      query: String(s.query).trim(),
      rationale: typeof s.rationale === 'string' ? s.rationale : undefined
    }))
    .filter(s => s.query.length > 0)

  if (steps.length === 0) return null
  return { topic, steps }
}

function formatStepResult(
  step: ResearchPlanStep,
  result: { success: boolean; data?: unknown; error?: string }
): string {
  const header = `## Step ${step.stepNumber}: "${step.query}"`
  if (!result.success) {
    return `${header}\nError: ${result.error || 'Unknown error'}\n`
  }
  const data = result.data as { results?: Array<{ title?: string; snippet?: string; url?: string }> } | undefined
  const results = data?.results || (Array.isArray(data) ? data : [])
  if (results.length === 0) {
    return `${header}\nNo results.\n`
  }
  const snippets = results
    .slice(0, 5)
    .map((r, i) => {
      const title = r.title || `Result ${i + 1}`
      const snippet = r.snippet || ''
      const url = r.url || ''
      return `- **${title}**: ${snippet}${url ? ` (${url})` : ''}`
    })
    .join('\n')
  return `${header}\n${snippets}\n`
}

export type OnResearchPlanProgress = (currentStep: number, totalSteps: number, query?: string) => void

/**
 * Execute a research_plan tool call: run web_search for each step in parallel.
 * Steps are fired concurrently (up to MAX_CONCURRENT) and results are
 * reassembled in the original step order.
 */
export async function executeResearchPlanTool(
  toolCall: ToolCall,
  onProgress?: OnResearchPlanProgress
): Promise<ToolCallResult> {
  const plan = parseResearchPlanArgs(toolCall.arguments)
  if (!plan) {
    return {
      toolCall,
      result: {
        success: false,
        error: 'Invalid research_plan: topic and steps (array of {stepNumber, query}) are required.'
      }
    }
  }

  const totalSteps = plan.steps.length
  let completedCount = 0

  // Signal that research is starting
  onProgress?.(1, totalSteps, plan.steps[0]?.query)

  // Execute all steps in parallel — each step is an independent web search
  const stepPromises = plan.steps.map(async (step) => {
    const result: ToolResult = await executeTool('web_search', {
      query: step.query,
      num_results: 5,
      search_depth: 'advanced'
    })

    // Report progress as each step completes
    completedCount++
    onProgress?.(completedCount, totalSteps, step.query)

    return formatStepResult(step, result)
  })

  const parts = await Promise.all(stepPromises)
  const combinedResults = [`# Research: ${plan.topic}`, '', ...parts].join('\n')

  return {
    toolCall,
    result: {
      success: true,
      data: { combinedResults }
    }
  }
}

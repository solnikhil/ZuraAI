/**
 * Research Executor - Runs web_search for each step of a research plan
 * Used by structured research mode (step-by-step research).
 */

import { executeTool } from '../tools/executor'
import type { ResearchPlan, ResearchPlanStep } from './researchPlanner'

export interface ExecutedStepResult {
  step: ResearchPlanStep
  success: boolean
  data?: unknown
  error?: string
  executionTime?: number
}

export interface ResearchExecutionResult {
  topic: string
  stepResults: ExecutedStepResult[]
  /** Formatted text for synthesis prompt */
  combinedResults: string
}

function formatStepResult(step: ResearchPlanStep, result: { success: boolean; data?: unknown; error?: string }): string {
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

export async function executeResearchPlan(
  plan: ResearchPlan,
  onStepProgress?: (currentStep: number, totalSteps: number, query?: string) => void,
  options?: { signal?: AbortSignal }
): Promise<ResearchExecutionResult> {
  const stepResults: ExecutedStepResult[] = []
  const parts: string[] = []

  for (let i = 0; i < plan.steps.length; i++) {
    if (options?.signal?.aborted) break

    const step = plan.steps[i]
    onStepProgress?.(i + 1, plan.steps.length, step.query)

    const result = await executeTool('web_search', {
      query: step.query,
      num_results: 5,
      search_depth: 'advanced'
    })

    const executed: ExecutedStepResult = {
      step,
      success: result.success,
      data: result.data,
      error: result.error,
      executionTime: result.executionTime
    }
    stepResults.push(executed)
    parts.push(formatStepResult(step, result))
  }

  const combinedResults = [
    `# Research: ${plan.topic}`,
    '',
    ...parts
  ].join('\n')

  return {
    topic: plan.topic,
    stepResults,
    combinedResults
  }
}

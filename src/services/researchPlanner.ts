/**
 * Research Planner - Generates a structured search plan via LLM
 * Used by structured research mode (step-by-step research).
 */

import { generateOpenRouterCompletion } from './openrouter'
import type { ChatMessage } from './types'

export interface ResearchPlanStep {
  stepNumber: number
  query: string
  rationale?: string
}

export interface ResearchPlan {
  topic: string
  steps: ResearchPlanStep[]
}

const RESEARCH_PLAN_SCHEMA = {
  type: 'object',
  properties: {
    topic: {
      type: 'string',
      description: 'Short topic summary of the user question'
    },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          stepNumber: { type: 'number', description: '1-based step index' },
          query: { type: 'string', description: 'Search query for web_search' },
          rationale: { type: 'string', description: 'Why this search helps' }
        },
        required: ['stepNumber', 'query']
      }
    }
  },
  required: ['topic', 'steps']
} as const

const PLANNER_SYSTEM = `You are a research planner. Given a user question, output a JSON object with:
- topic: a short summary of the research topic
- steps: an array of 2-6 search steps. Each step has:
  - stepNumber: 1-based index
  - query: concise search query (under 400 chars, keyword-focused)
  - rationale: optional brief reason for this search

Keep queries focused and non-overlapping. Use keyword phrasing, not full sentences.`

export async function generateResearchPlan(
  apiKey: string,
  model: string,
  userQuestion: string,
  options?: { signal?: AbortSignal }
): Promise<ResearchPlan> {
  const messages: ChatMessage[] = [
    { role: 'system', content: PLANNER_SYSTEM },
    { role: 'user', content: userQuestion }
  ]

  const response = await generateOpenRouterCompletion(apiKey, model, messages, {
    stream: false,
    temperature: 0.3,
    maxTokens: 2048,
    responseFormat: {
      type: 'json_schema',
      json_schema: {
        name: 'research_plan',
        strict: true,
        schema: RESEARCH_PLAN_SCHEMA as unknown as Record<string, unknown>
      }
    },
    signal: options?.signal
  })

  const content = response.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('Empty response from research planner')
  }

  let parsed: { topic?: string; steps?: ResearchPlanStep[] }
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('Invalid JSON from research planner')
  }

  const topic = typeof parsed.topic === 'string' ? parsed.topic : userQuestion.slice(0, 80)
  const steps = Array.isArray(parsed.steps)
    ? parsed.steps
        .filter((s): s is ResearchPlanStep => s && typeof s.stepNumber === 'number' && typeof s.query === 'string')
        .map((s, i) => ({
          stepNumber: i + 1,
          query: String(s.query).trim(),
          rationale: typeof s.rationale === 'string' ? s.rationale : undefined
        }))
    : []

  return { topic, steps }
}

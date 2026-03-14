import type { ToolCall, ToolCallResult } from './types'
import type {
  SmokeAssertion,
  SmokeStep,
  TargetRef,
  WebsiteSmokeTestInput,
  WebsiteSmokeTestProposalResult,
} from '@/testing/types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`)
  }

  return value.trim()
}

function normalizeHttpUrl(value: string, fieldName: string): string {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`${fieldName} must be a valid http or https URL.`)
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${fieldName} must use http or https.`)
  }

  return parsed.toString()
}

function normalizeTarget(value: unknown, fieldName: string): TargetRef {
  if (!isRecord(value)) {
    throw new Error(`${fieldName} must be an object.`)
  }

  const by = asNonEmptyString(value.by, `${fieldName}.by`) as TargetRef['by']
  const targetValue = asNonEmptyString(value.value, `${fieldName}.value`)
  const allowed: TargetRef['by'][] = ['role', 'label', 'text', 'placeholder', 'testId', 'css']

  if (!allowed.includes(by)) {
    throw new Error(`${fieldName}.by must be one of ${allowed.join(', ')}.`)
  }

  return { by, value: targetValue }
}

function normalizeStep(raw: unknown, index: number, rootUrl: string): SmokeStep {
  if (!isRecord(raw)) {
    throw new Error(`steps[${index}] must be an object.`)
  }

  const type = asNonEmptyString(raw.type, `steps[${index}].type`) as SmokeStep['type']
  switch (type) {
    case 'goto':
      return { type, url: raw.url ? normalizeHttpUrl(asNonEmptyString(raw.url, `steps[${index}].url`), `steps[${index}].url`) : rootUrl }
    case 'click':
      return { type, target: normalizeTarget(raw.target, `steps[${index}].target`) }
    case 'fill':
      return {
        type,
        target: normalizeTarget(raw.target, `steps[${index}].target`),
        value: asNonEmptyString(raw.value, `steps[${index}].value`),
      }
    case 'press':
      return { type, key: asNonEmptyString(raw.key, `steps[${index}].key`) }
    case 'select':
      return {
        type,
        target: normalizeTarget(raw.target, `steps[${index}].target`),
        value: asNonEmptyString(raw.value, `steps[${index}].value`),
      }
    case 'waitForText':
      return { type, text: asNonEmptyString(raw.text, `steps[${index}].text`) }
    case 'waitForElement':
      return { type, target: normalizeTarget(raw.target, `steps[${index}].target`) }
    default:
      throw new Error(`steps[${index}].type is not supported.`)
  }
}

function normalizeAssertion(raw: unknown, index: number): SmokeAssertion {
  if (!isRecord(raw)) {
    throw new Error(`assertions[${index}] must be an object.`)
  }

  const type = asNonEmptyString(raw.type, `assertions[${index}].type`) as SmokeAssertion['type']
  switch (type) {
    case 'textVisible':
      return { type, text: asNonEmptyString(raw.text, `assertions[${index}].text`) }
    case 'elementVisible':
    case 'elementEnabled':
      return { type, target: normalizeTarget(raw.target, `assertions[${index}].target`) }
    case 'urlContains':
    case 'urlEquals':
    case 'titleContains':
      return { type, value: asNonEmptyString(raw.value, `assertions[${index}].value`) }
    default:
      throw new Error(`assertions[${index}].type is not supported.`)
  }
}

function normalizeProposalInput(args: Record<string, unknown>): WebsiteSmokeTestInput {
  const url = normalizeHttpUrl(asNonEmptyString(args.url, 'url'), 'url')
  const goal = asNonEmptyString(args.goal, 'goal')
  const stepsRaw = args.steps
  const assertionsRaw = args.assertions

  if (!Array.isArray(stepsRaw) || stepsRaw.length === 0) {
    throw new Error('steps must be a non-empty array.')
  }

  return {
    url,
    goal,
    steps: stepsRaw.map((step, index) => normalizeStep(step, index, url)),
    assertions: Array.isArray(assertionsRaw)
      ? assertionsRaw.map((assertion, index) => normalizeAssertion(assertion, index))
      : [],
    options: {
      headless: true,
      timeoutMs: typeof args.options === 'object' && args.options && typeof (args.options as Record<string, unknown>).timeoutMs === 'number'
        ? ((args.options as Record<string, unknown>).timeoutMs as number)
        : 30_000,
      viewport:
        typeof args.options === 'object' && args.options && isRecord((args.options as Record<string, unknown>).viewport)
          ? {
              width: Number((args.options as Record<string, unknown>).viewport && ((args.options as Record<string, unknown>).viewport as Record<string, unknown>).width) || 1440,
              height: Number((args.options as Record<string, unknown>).viewport && ((args.options as Record<string, unknown>).viewport as Record<string, unknown>).height) || 900,
            }
          : { width: 1440, height: 900 },
      screenshots:
        typeof args.options === 'object' && args.options && ['final-only', 'each-step', 'off'].includes(String((args.options as Record<string, unknown>).screenshots))
          ? (String((args.options as Record<string, unknown>).screenshots) as 'final-only' | 'each-step' | 'off')
          : 'final-only',
      trace:
        typeof args.options === 'object' && args.options && ['on-failure', 'always', 'off'].includes(String((args.options as Record<string, unknown>).trace))
          ? (String((args.options as Record<string, unknown>).trace) as 'on-failure' | 'always' | 'off')
          : 'on-failure',
    },
  }
}

function buildProposalSummary(input: WebsiteSmokeTestInput): string {
  const stepCount = input.steps.length
  const assertionCount = input.assertions?.length || 0
  return `Proposed a website smoke test for ${input.url} with ${stepCount} step${stepCount === 1 ? '' : 's'} and ${assertionCount} visible assertion${assertionCount === 1 ? '' : 's'}. Wait for user approval before running it.`
}

export async function executeWebsiteSmokeProposalTool(toolCall: ToolCall): Promise<ToolCallResult> {
  try {
    const proposal = normalizeProposalInput(toolCall.arguments)
    const data: WebsiteSmokeTestProposalResult = {
      status: 'awaiting_approval',
      createdAt: new Date().toISOString(),
      proposal,
      summary: buildProposalSummary(proposal),
    }

    return {
      toolCall,
      result: {
        success: true,
        data,
      },
    }
  } catch (error) {
    return {
      toolCall,
      result: {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Invalid propose_website_smoke_test arguments.',
      },
    }
  }
}

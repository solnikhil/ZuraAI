import {
  TARGET_REF_ORDER,
  WEBSITE_SMOKE_TEST_ASSERTION_LIMIT,
  WEBSITE_SMOKE_TEST_DEFAULT_TIMEOUT_MS,
  WEBSITE_SMOKE_TEST_DEFAULT_VIEWPORT,
  WEBSITE_SMOKE_TEST_MAX_RUNTIME_MS,
  WEBSITE_SMOKE_TEST_STEP_LIMIT,
  type SmokeAssertion,
  type SmokeStep,
  type TargetRef,
  type WebsiteSmokeTestInput,
} from '../../src/testing/types'

const MIN_TIMEOUT_MS = 1_000
const MIN_VIEWPORT_SIZE = 320
const MAX_VIEWPORT_SIZE = 4_096

export interface NormalizedWebsiteSmokeTestInput extends WebsiteSmokeTestInput {
  assertions: SmokeAssertion[]
  options: {
    headless: boolean
    timeoutMs: number
    viewport: {
      width: number
      height: number
    }
    screenshots: 'final-only' | 'each-step' | 'off'
    trace: 'on-failure' | 'always' | 'off'
  }
}

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

function normalizeTargetRef(value: unknown, fieldName: string): TargetRef {
  if (!isRecord(value)) {
    throw new Error(`${fieldName} must be an object with by and value.`)
  }

  const by = value.by
  const targetValue = value.value

  if (typeof by !== 'string' || !TARGET_REF_ORDER.includes(by as (typeof TARGET_REF_ORDER)[number])) {
    throw new Error(`${fieldName}.by must be one of: ${TARGET_REF_ORDER.join(', ')}.`)
  }

  if (typeof targetValue !== 'string' || targetValue.trim().length === 0) {
    throw new Error(`${fieldName}.value must be a non-empty string.`)
  }

  return {
    by: by as TargetRef['by'],
    value: targetValue.trim(),
  }
}

function normalizeStep(step: unknown, index: number, rootUrl: string): SmokeStep {
  if (!isRecord(step)) {
    throw new Error(`steps[${index}] must be an object.`)
  }

  const type = step.type
  if (typeof type !== 'string') {
    throw new Error(`steps[${index}].type must be a string.`)
  }

  switch (type) {
    case 'goto': {
      const url = step.url == null ? rootUrl : normalizeHttpUrl(asNonEmptyString(step.url, `steps[${index}].url`), `steps[${index}].url`)
      return { type, url }
    }
    case 'click':
      return { type, target: normalizeTargetRef(step.target, `steps[${index}].target`) }
    case 'fill':
      return {
        type,
        target: normalizeTargetRef(step.target, `steps[${index}].target`),
        value: asNonEmptyString(step.value, `steps[${index}].value`),
      }
    case 'press':
      return { type, key: asNonEmptyString(step.key, `steps[${index}].key`) }
    case 'select':
      return {
        type,
        target: normalizeTargetRef(step.target, `steps[${index}].target`),
        value: asNonEmptyString(step.value, `steps[${index}].value`),
      }
    case 'waitForText':
      return { type, text: asNonEmptyString(step.text, `steps[${index}].text`) }
    case 'waitForElement':
      return { type, target: normalizeTargetRef(step.target, `steps[${index}].target`) }
    default:
      throw new Error(`steps[${index}].type is not supported.`)
  }
}

function normalizeAssertion(assertion: unknown, index: number): SmokeAssertion {
  if (!isRecord(assertion)) {
    throw new Error(`assertions[${index}] must be an object.`)
  }

  const type = assertion.type
  if (typeof type !== 'string') {
    throw new Error(`assertions[${index}].type must be a string.`)
  }

  switch (type) {
    case 'textVisible':
      return { type, text: asNonEmptyString(assertion.text, `assertions[${index}].text`) }
    case 'elementVisible':
    case 'elementEnabled':
      return { type, target: normalizeTargetRef(assertion.target, `assertions[${index}].target`) }
    case 'urlContains':
    case 'urlEquals':
    case 'titleContains':
      return { type, value: asNonEmptyString(assertion.value, `assertions[${index}].value`) }
    default:
      throw new Error(`assertions[${index}].type is not supported.`)
  }
}

function normalizeTimeoutMs(value: unknown): number {
  if (value == null) return WEBSITE_SMOKE_TEST_DEFAULT_TIMEOUT_MS
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error('options.timeoutMs must be a finite number.')
  }
  return Math.min(WEBSITE_SMOKE_TEST_MAX_RUNTIME_MS, Math.max(MIN_TIMEOUT_MS, Math.round(parsed)))
}

function normalizeViewport(value: unknown): { width: number; height: number } {
  if (!isRecord(value)) {
    return { ...WEBSITE_SMOKE_TEST_DEFAULT_VIEWPORT }
  }

  const width = Number(value.width)
  const height = Number(value.height)
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error('options.viewport.width and options.viewport.height must be finite numbers.')
  }

  return {
    width: Math.max(MIN_VIEWPORT_SIZE, Math.min(MAX_VIEWPORT_SIZE, Math.round(width))),
    height: Math.max(MIN_VIEWPORT_SIZE, Math.min(MAX_VIEWPORT_SIZE, Math.round(height))),
  }
}

export function validateWebsiteSmokeTestInput(raw: unknown): NormalizedWebsiteSmokeTestInput {
  if (!isRecord(raw)) {
    throw new Error('Website smoke test input must be an object.')
  }

  const url = normalizeHttpUrl(asNonEmptyString(raw.url, 'url'), 'url')
  const goal = asNonEmptyString(raw.goal, 'goal')

  if (!Array.isArray(raw.steps) || raw.steps.length === 0) {
    throw new Error('steps must be a non-empty array.')
  }
  if (raw.steps.length > WEBSITE_SMOKE_TEST_STEP_LIMIT) {
    throw new Error(`steps cannot exceed ${WEBSITE_SMOKE_TEST_STEP_LIMIT}.`)
  }

  const steps = raw.steps.map((step, index) => normalizeStep(step, index, url))

  const assertionsRaw = raw.assertions
  if (assertionsRaw != null && !Array.isArray(assertionsRaw)) {
    throw new Error('assertions must be an array when provided.')
  }
  if (Array.isArray(assertionsRaw) && assertionsRaw.length > WEBSITE_SMOKE_TEST_ASSERTION_LIMIT) {
    throw new Error(`assertions cannot exceed ${WEBSITE_SMOKE_TEST_ASSERTION_LIMIT}.`)
  }

  const options = isRecord(raw.options) ? raw.options : {}
  const screenshots =
    options.screenshots === 'each-step' || options.screenshots === 'off' || options.screenshots === 'final-only'
      ? options.screenshots
      : 'final-only'
  const trace =
    options.trace === 'always' || options.trace === 'off' || options.trace === 'on-failure'
      ? options.trace
      : 'on-failure'
  const headless = typeof options.headless === 'boolean' ? options.headless : true

  return {
    url,
    goal,
    steps,
    assertions: Array.isArray(assertionsRaw)
      ? assertionsRaw.map((assertion, index) => normalizeAssertion(assertion, index))
      : [],
    options: {
      headless,
      timeoutMs: normalizeTimeoutMs(options.timeoutMs),
      viewport: normalizeViewport(options.viewport),
      screenshots,
      trace,
    },
  }
}

export const WEBSITE_SMOKE_TEST_STEP_LIMIT = 10
export const WEBSITE_SMOKE_TEST_ASSERTION_LIMIT = 5
export const WEBSITE_SMOKE_TEST_MAX_RUNTIME_MS = 90_000
export const WEBSITE_SMOKE_TEST_DEFAULT_TIMEOUT_MS = 30_000
export const WEBSITE_SMOKE_TEST_DEFAULT_VIEWPORT = {
  width: 1440,
  height: 900,
} as const

export const TARGET_REF_ORDER = ['role', 'label', 'text', 'placeholder', 'testId', 'css'] as const

export type TargetRefBy = (typeof TARGET_REF_ORDER)[number]

export interface TargetRef {
  by: TargetRefBy
  value: string
}

export type SmokeScreenshotMode = 'final-only' | 'each-step' | 'off'
export type SmokeTraceMode = 'on-failure' | 'always' | 'off'

export type SmokeStep =
  | { type: 'goto'; url?: string }
  | { type: 'click'; target: TargetRef }
  | { type: 'fill'; target: TargetRef; value: string }
  | { type: 'press'; key: string }
  | { type: 'select'; target: TargetRef; value: string }
  | { type: 'waitForText'; text: string }
  | { type: 'waitForElement'; target: TargetRef }

export type SmokeAssertion =
  | { type: 'textVisible'; text: string }
  | { type: 'elementVisible'; target: TargetRef }
  | { type: 'elementEnabled'; target: TargetRef }
  | { type: 'urlContains'; value: string }
  | { type: 'urlEquals'; value: string }
  | { type: 'titleContains'; value: string }

export interface WebsiteSmokeTestInput {
  url: string
  goal: string
  steps: SmokeStep[]
  assertions?: SmokeAssertion[]
  options?: {
    headless?: boolean
    timeoutMs?: number
    viewport?: {
      width: number
      height: number
    }
    screenshots?: SmokeScreenshotMode
    trace?: SmokeTraceMode
  }
}

export interface WebsiteSmokeTestAssertionResult {
  assertion: SmokeAssertion
  status: 'passed' | 'failed' | 'skipped'
  message: string
}

export interface WebsiteSmokeTestArtifacts {
  runId?: string
  runDirectoryPath?: string
  finalScreenshotPath?: string
  failureScreenshotPath?: string
  tracePath?: string
  stepLogPath?: string
  metadataPath?: string
  stepScreenshots?: string[]
}

export interface WebsiteSmokeTestResult {
  status: 'passed' | 'failed' | 'partial'
  targetUrl: string
  goal: string
  startedAt: string
  finishedAt: string
  completedSteps: number
  totalSteps: number
  failedStepIndex?: number
  failedStepReason?: string
  assertionResults: WebsiteSmokeTestAssertionResult[]
  artifacts: WebsiteSmokeTestArtifacts
  summary: string
}

export interface WebsiteSmokeTestProposalResult {
  status: 'awaiting_approval' | 'running' | 'completed' | 'execution_failed'
  createdAt: string
  proposal: WebsiteSmokeTestInput
  summary: string
  executionError?: string
  executionResult?: WebsiteSmokeTestResult
}

export interface WebsiteSmokeTestStepLogEntry {
  index: number
  title: string
  status: 'passed' | 'failed'
  startedAt: string
  finishedAt: string
  message: string
  screenshotPath?: string
}

export interface WebsiteSmokeTestRunRecord {
  runId: string
  input: WebsiteSmokeTestInput
  result: WebsiteSmokeTestResult
  stepLog: WebsiteSmokeTestStepLogEntry[]
}

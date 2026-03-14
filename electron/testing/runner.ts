import type { Browser, BrowserContext, Page } from 'playwright'

import {
  WEBSITE_SMOKE_TEST_MAX_RUNTIME_MS,
  type SmokeAssertion,
  type SmokeStep,
  type WebsiteSmokeTestAssertionResult,
  type WebsiteSmokeTestResult,
  type WebsiteSmokeTestRunRecord,
  type WebsiteSmokeTestStepLogEntry,
} from '../../src/testing/types'
import { createTestingRunArtifactStore } from './artifactStore'
import { describeTargetRef, getLocatorForTarget } from './locator'
import { deriveWebsiteSmokeTestStatus, formatWebsiteSmokeTestSummary } from './summary'
import type { NormalizedWebsiteSmokeTestInput } from './validation'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForCondition(
  predicate: () => Promise<boolean>,
  timeoutMs: number,
  failureMessage: string
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown

  while (Date.now() <= deadline) {
    try {
      if (await predicate()) {
        return
      }
    } catch (error) {
      lastError = error
    }

    await sleep(200)
  }

  if (lastError instanceof Error) {
    throw new Error(`${failureMessage} ${lastError.message}`)
  }

  throw new Error(failureMessage)
}

function buildStepTitle(step: SmokeStep): string {
  switch (step.type) {
    case 'goto':
      return `Navigate to ${step.url || 'the target URL'}`
    case 'click':
      return `Click ${describeTargetRef(step.target)}`
    case 'fill':
      return `Fill ${describeTargetRef(step.target)}`
    case 'press':
      return `Press ${step.key}`
    case 'select':
      return `Select ${step.value} in ${describeTargetRef(step.target)}`
    case 'waitForText':
      return `Wait for text ${JSON.stringify(step.text)}`
    case 'waitForElement':
      return `Wait for ${describeTargetRef(step.target)}`
  }
}

async function executeStep(page: Page, step: SmokeStep, timeoutMs: number): Promise<void> {
  switch (step.type) {
    case 'goto':
      await page.goto(step.url!, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
      return
    case 'click':
      await getLocatorForTarget(page, step.target).click({ timeout: timeoutMs })
      return
    case 'fill':
      await getLocatorForTarget(page, step.target).fill(step.value, { timeout: timeoutMs })
      return
    case 'press':
      await page.keyboard.press(step.key)
      return
    case 'select':
      await getLocatorForTarget(page, step.target).selectOption(step.value, { timeout: timeoutMs })
      return
    case 'waitForText':
      await page.getByText(step.text, { exact: false }).waitFor({ state: 'visible', timeout: timeoutMs })
      return
    case 'waitForElement':
      await getLocatorForTarget(page, step.target).waitFor({ state: 'visible', timeout: timeoutMs })
      return
  }
}

async function runAssertion(
  page: Page,
  assertion: SmokeAssertion,
  timeoutMs: number
): Promise<WebsiteSmokeTestAssertionResult> {
  switch (assertion.type) {
    case 'textVisible':
      await page.getByText(assertion.text, { exact: false }).waitFor({ state: 'visible', timeout: timeoutMs })
      return {
        assertion,
        status: 'passed',
        message: `Visible text ${JSON.stringify(assertion.text)} was found.`,
      }
    case 'elementVisible':
      await getLocatorForTarget(page, assertion.target).waitFor({ state: 'visible', timeout: timeoutMs })
      return {
        assertion,
        status: 'passed',
        message: `Element ${describeTargetRef(assertion.target)} is visible.`,
      }
    case 'elementEnabled':
      await waitForCondition(
        () => getLocatorForTarget(page, assertion.target).isEnabled(),
        timeoutMs,
        `Expected ${describeTargetRef(assertion.target)} to be enabled.`
      )
      return {
        assertion,
        status: 'passed',
        message: `Element ${describeTargetRef(assertion.target)} is enabled.`,
      }
    case 'urlContains':
      await waitForCondition(
        async () => page.url().includes(assertion.value),
        timeoutMs,
        `Expected the URL to contain ${JSON.stringify(assertion.value)}.`
      )
      return {
        assertion,
        status: 'passed',
        message: `URL contains ${JSON.stringify(assertion.value)}.`,
      }
    case 'urlEquals':
      await waitForCondition(
        async () => page.url() === assertion.value,
        timeoutMs,
        `Expected the URL to equal ${JSON.stringify(assertion.value)}.`
      )
      return {
        assertion,
        status: 'passed',
        message: `URL equals ${JSON.stringify(assertion.value)}.`,
      }
    case 'titleContains':
      await waitForCondition(
        async () => (await page.title()).includes(assertion.value),
        timeoutMs,
        `Expected the page title to contain ${JSON.stringify(assertion.value)}.`
      )
      return {
        assertion,
        status: 'passed',
        message: `Page title contains ${JSON.stringify(assertion.value)}.`,
      }
  }
}

async function captureScreenshot(page: Page | null, outputPath: string): Promise<string | undefined> {
  if (!page || page.isClosed()) {
    return undefined
  }

  await page.screenshot({ path: outputPath, fullPage: true })
  return outputPath
}

function ensureWithinRuntime(deadline: number): void {
  if (Date.now() > deadline) {
    throw new Error(`Smoke test exceeded the ${WEBSITE_SMOKE_TEST_MAX_RUNTIME_MS / 1000}-second runtime limit.`)
  }
}

export async function executeWebsiteSmokeTestRun(
  input: NormalizedWebsiteSmokeTestInput
): Promise<WebsiteSmokeTestRunRecord> {
  const { chromium } = await import('playwright')
  const artifactStore = await createTestingRunArtifactStore()
  const startedAt = new Date().toISOString()
  const deadline = Date.now() + WEBSITE_SMOKE_TEST_MAX_RUNTIME_MS
  const stepLog: WebsiteSmokeTestStepLogEntry[] = []
  const assertionResults: WebsiteSmokeTestAssertionResult[] = []
  const stepScreenshots: string[] = []

  let completedSteps = 0
  let failedStepIndex: number | undefined
  let failedStepReason: string | undefined
  let finalScreenshotPath: string | undefined
  let failureScreenshotPath: string | undefined
  let tracePath: string | undefined

  let page: Page | null = null
  let browser: Browser | null = null
  let context: BrowserContext | null = null

  try {
    browser = await chromium.launch({ headless: input.options.headless })
    context = await browser.newContext({ viewport: input.options.viewport })

    if (input.options.trace !== 'off') {
      await context.tracing.start({ screenshots: true, snapshots: true })
    }

    page = await context.newPage()
    await page.goto(input.url, { waitUntil: 'domcontentloaded', timeout: input.options.timeoutMs })

    for (const [index, step] of input.steps.entries()) {
      ensureWithinRuntime(deadline)

      const started = new Date().toISOString()
      const title = buildStepTitle(step)

      try {
        await executeStep(page, step, input.options.timeoutMs)
        completedSteps = index + 1

        let screenshotPath: string | undefined
        if (input.options.screenshots === 'each-step') {
          screenshotPath = await captureScreenshot(page, artifactStore.getStepScreenshotPath(index))
          if (screenshotPath) {
            stepScreenshots.push(screenshotPath)
          }
        }

        stepLog.push({
          index,
          title,
          status: 'passed',
          startedAt: started,
          finishedAt: new Date().toISOString(),
          message: 'Completed successfully.',
          screenshotPath,
        })
      } catch (error) {
        failedStepIndex = index
        failedStepReason = error instanceof Error ? error.message : 'Step execution failed.'
        failureScreenshotPath = await captureScreenshot(page, artifactStore.getFailureScreenshotPath())
        stepLog.push({
          index,
          title,
          status: 'failed',
          startedAt: started,
          finishedAt: new Date().toISOString(),
          message: failedStepReason,
          screenshotPath: failureScreenshotPath,
        })
        break
      }
    }

    if (failedStepIndex == null) {
      let assertionFailureMessage: string | undefined

      for (const [index, assertion] of input.assertions.entries()) {
        ensureWithinRuntime(deadline)

        if (assertionFailureMessage) {
          assertionResults.push({
            assertion,
            status: 'skipped',
            message: 'Skipped because an earlier assertion failed.',
          })
          continue
        }

        try {
          assertionResults.push(await runAssertion(page, assertion, input.options.timeoutMs))
        } catch (error) {
          assertionFailureMessage = error instanceof Error ? error.message : 'Assertion failed.'
          failedStepReason = assertionFailureMessage
          failureScreenshotPath =
            failureScreenshotPath ||
            (await captureScreenshot(page, artifactStore.getFailureScreenshotPath()))
          assertionResults.push({
            assertion,
            status: 'failed',
            message: assertionFailureMessage,
          })

          for (const skipped of input.assertions.slice(index + 1)) {
            assertionResults.push({
              assertion: skipped,
              status: 'skipped',
              message: 'Skipped because an earlier assertion failed.',
            })
          }
        }
      }
    }

    if ((failedStepIndex == null && !assertionResults.some((item) => item.status === 'failed')) && input.options.screenshots !== 'off') {
      finalScreenshotPath = await captureScreenshot(page, artifactStore.getFinalScreenshotPath())
    }
  } catch (error) {
    failedStepReason = error instanceof Error ? error.message : 'Smoke test setup failed.'
    failureScreenshotPath =
      failureScreenshotPath ||
      (await captureScreenshot(page, artifactStore.getFailureScreenshotPath()))
  } finally {
    if (context && input.options.trace !== 'off') {
      const shouldPersistTrace =
        input.options.trace === 'always' || failedStepIndex != null || assertionResults.some((item) => item.status === 'failed') || !!failedStepReason

      if (shouldPersistTrace) {
        tracePath = artifactStore.getTracePath()
        await context.tracing.stop({ path: tracePath })
      } else {
        await context.tracing.stop()
      }
    }

    if (browser) {
      await browser.close()
    }
  }

  const finishedAt = new Date().toISOString()
  const status = deriveWebsiteSmokeTestStatus({
    totalSteps: input.steps.length,
    completedSteps,
    assertionResults,
    failedStepIndex,
  })

  const result: WebsiteSmokeTestResult = {
    status,
    targetUrl: input.url,
    goal: input.goal,
    startedAt,
    finishedAt,
    completedSteps,
    totalSteps: input.steps.length,
    failedStepIndex,
    failedStepReason,
    assertionResults,
    artifacts: {
      ...artifactStore.artifacts,
      finalScreenshotPath,
      failureScreenshotPath,
      tracePath,
      stepScreenshots,
    },
    summary: '',
  }

  result.summary = formatWebsiteSmokeTestSummary(result)

  const record: WebsiteSmokeTestRunRecord = {
    runId: artifactStore.runId,
    input,
    result,
    stepLog,
  }

  await artifactStore.writeStepLog(stepLog)
  await artifactStore.writeSummary(result.summary)
  await artifactStore.writeMetadata(record)

  return record
}

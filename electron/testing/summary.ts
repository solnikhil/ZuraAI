import type {
  WebsiteSmokeTestAssertionResult,
  WebsiteSmokeTestResult,
} from '../../src/testing/types'

export function deriveWebsiteSmokeTestStatus(args: {
  totalSteps: number
  completedSteps: number
  assertionResults: WebsiteSmokeTestAssertionResult[]
  failedStepIndex?: number
}): WebsiteSmokeTestResult['status'] {
  const { totalSteps, completedSteps, assertionResults, failedStepIndex } = args
  const hasFailedAssertion = assertionResults.some((assertion) => assertion.status === 'failed')

  if (failedStepIndex == null && !hasFailedAssertion && completedSteps === totalSteps) {
    return 'passed'
  }

  if (completedSteps > 0 || hasFailedAssertion) {
    return 'partial'
  }

  return 'failed'
}

export function formatWebsiteSmokeTestSummary(result: Pick<WebsiteSmokeTestResult,
  | 'status'
  | 'goal'
  | 'targetUrl'
  | 'completedSteps'
  | 'totalSteps'
  | 'failedStepIndex'
  | 'failedStepReason'
  | 'assertionResults'
>): string {
  const passedAssertions = result.assertionResults.filter((item) => item.status === 'passed').length
  const failedAssertions = result.assertionResults.filter((item) => item.status === 'failed').length

  if (result.status === 'passed') {
    return `The website smoke test passed for ${result.targetUrl}. It completed all ${result.totalSteps} steps for "${result.goal}" and all visible assertions passed.`
  }

  if (result.failedStepIndex != null) {
    return `The website smoke test ${result.status} after step ${result.failedStepIndex + 1} of ${result.totalSteps} for "${result.goal}". ${result.failedStepReason || 'A browser action did not complete as expected.'}`
  }

  if (failedAssertions > 0) {
    return `The website smoke test completed ${result.completedSteps} of ${result.totalSteps} steps for "${result.goal}", but ${failedAssertions} visible assertion${failedAssertions === 1 ? '' : 's'} failed while ${passedAssertions} passed.`
  }

  return `The website smoke test ${result.status} after completing ${result.completedSteps} of ${result.totalSteps} steps for "${result.goal}".`
}

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../testing/validation', () => ({
  validateWebsiteSmokeTestInput: vi.fn(),
}))

vi.mock('../testing/runner', () => ({
  executeWebsiteSmokeTestRun: vi.fn(),
}))

const { validateWebsiteSmokeTestInput } = await import('../testing/validation')
const { executeWebsiteSmokeTestRun } = await import('../testing/runner')
const { executeWebsiteSmokeTest } = await import('./websiteSmokeTest')

describe('executeWebsiteSmokeTest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the runner result when validation succeeds', async () => {
    vi.mocked(validateWebsiteSmokeTestInput).mockReturnValue({
      url: 'https://example.com/',
      goal: 'Check homepage',
      steps: [{ type: 'goto', url: 'https://example.com/' }],
      assertions: [],
      options: {
        headless: true,
        timeoutMs: 30_000,
        viewport: { width: 1440, height: 900 },
        screenshots: 'final-only',
        trace: 'on-failure',
      },
    })

    vi.mocked(executeWebsiteSmokeTestRun).mockResolvedValue({
      runId: 'run-12345',
      input: {} as never,
      stepLog: [],
      result: {
        status: 'passed',
        targetUrl: 'https://example.com/',
        goal: 'Check homepage',
        startedAt: '2026-01-01T00:00:00.000Z',
        finishedAt: '2026-01-01T00:00:01.000Z',
        completedSteps: 1,
        totalSteps: 1,
        assertionResults: [],
        artifacts: {},
        summary: 'Passed.',
      },
    })

    const result = await executeWebsiteSmokeTest({})

    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        status: 'passed',
        summary: 'Passed.',
      }),
    })
  })

  it('returns a readable error when validation or execution throws', async () => {
    vi.mocked(validateWebsiteSmokeTestInput).mockImplementation(() => {
      throw new Error('Bad smoke test input')
    })

    const result = await executeWebsiteSmokeTest({})
    expect(result).toEqual({
      success: false,
      error: 'Bad smoke test input',
    })
  })
})

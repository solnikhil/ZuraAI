// @vitest-environment node

import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const analyticsMocks = vi.hoisted(() => ({
  userDataDir: '',
  version: '1.0.0',
}))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name !== 'userData') throw new Error(`Unexpected path request: ${name}`)
      return analyticsMocks.userDataDir
    },
    getVersion: () => analyticsMocks.version,
  },
}))

describe('analytics service', () => {
  beforeEach(() => {
    analyticsMocks.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zura-analytics-'))
    analyticsMocks.version = '1.0.0'
    process.env.ZURA_POSTHOG_PROJECT_KEY = ''
    process.env.ZURA_POSTHOG_HOST = 'https://example.test'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true }))
    )
  })

  afterEach(async () => {
    const { resetAnalyticsStateForTests } = await import('./service')
    resetAnalyticsStateForTests()
    vi.unstubAllGlobals()
    delete process.env.ZURA_POSTHOG_PROJECT_KEY
    delete process.env.ZURA_POSTHOG_HOST
    fs.rmSync(analyticsMocks.userDataDir, { recursive: true, force: true })
    vi.resetModules()
  })

  it('does not send events while analytics is disabled', async () => {
    const { trackAnalyticsEvent } = await import('./service')

    await expect(trackAnalyticsEvent('app_start')).resolves.toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('sanitizes properties before sending', async () => {
    process.env.ZURA_POSTHOG_PROJECT_KEY = 'phc_test'
    const { setAnalyticsEnabled, trackAnalyticsEvent } = await import('./service')

    await setAnalyticsEnabled(true)
    vi.mocked(fetch).mockClear()
    await trackAnalyticsEvent('tool_used', {
      toolName: 'web_search',
      success: true,
      durationMs: 12.3,
      query: 'should not be sent',
      filePath: 'C:\\Users\\Nikhil\\secret.txt',
    })

    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body))
    expect(body.event).toBe('tool_used')
    expect(body.properties).toMatchObject({
      toolName: 'web_search',
      success: true,
      durationMs: 12,
    })
    expect(body.properties.query).toBeUndefined()
    expect(body.properties.filePath).toBeUndefined()
  })

  it('enforces a categorical privacy schema for Agent diagnostics', async () => {
    process.env.ZURA_POSTHOG_PROJECT_KEY = 'phc_test'
    const { setAnalyticsEnabled, trackAnalyticsEvent } = await import('./service')

    await setAnalyticsEnabled(true)
    vi.mocked(fetch).mockClear()
    await trackAnalyticsEvent('agent_run_finished', {
      runOutcome: 'failed',
      verificationOutcome: 'unverified',
      durationMs: 42,
      stopReason: 'budget_exhausted',
      budgetReason: 'tool_calls',
      runId: 'private-run-id',
      prompt: 'private prompt',
      path: 'C:\\Users\\Nikhil\\secret.txt',
      title: 'private title',
      toolName: 'not allowed on this event',
    })

    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body))
    expect(body.properties).toMatchObject({
      runOutcome: 'failed',
      verificationOutcome: 'unverified',
      durationMs: 42,
      stopReason: 'budget_exhausted',
      budgetReason: 'tool_calls',
    })
    expect(body.properties).not.toHaveProperty('runId')
    expect(body.properties).not.toHaveProperty('prompt')
    expect(body.properties).not.toHaveProperty('path')
    expect(body.properties).not.toHaveProperty('title')
    expect(body.properties).not.toHaveProperty('toolName')
  })

  it('sends first launch and app start when the user opts in', async () => {
    process.env.ZURA_POSTHOG_PROJECT_KEY = 'phc_test'
    const { setAnalyticsEnabled, getAnalyticsState } = await import('./service')

    await setAnalyticsEnabled(true)

    const events = vi.mocked(fetch).mock.calls.map((call) => {
      const body = JSON.parse(String(call[1]?.body))
      return body.event
    })
    expect(events).toEqual(['app_first_launch', 'app_start'])
    expect(getAnalyticsState().firstLaunchSent).toBe(true)
    expect(getAnalyticsState().consentState).toBe('accepted')
  })

  it('sends update installed on startup when enabled and version changed', async () => {
    process.env.ZURA_POSTHOG_PROJECT_KEY = 'phc_test'
    const { setAnalyticsEnabled, trackStartupAnalytics } = await import('./service')

    await setAnalyticsEnabled(true)
    await trackStartupAnalytics()
    vi.mocked(fetch).mockClear()

    analyticsMocks.version = '1.1.0'
    await trackStartupAnalytics()

    const events = vi.mocked(fetch).mock.calls.map((call) => {
      const body = JSON.parse(String(call[1]?.body))
      return body.event
    })
    expect(events).toEqual(['app_update_installed', 'app_start'])
  })
})

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

const STATE_FILE = 'analytics-state.json'

function statePath(): string {
  return path.join(analyticsMocks.userDataDir, STATE_FILE)
}

function quarantinedFiles(): string[] {
  return fs
    .readdirSync(analyticsMocks.userDataDir)
    .filter((name) => name.startsWith(`${STATE_FILE}.corrupt-`))
}

function writeState(contents: string): void {
  fs.writeFileSync(statePath(), contents, 'utf8')
}

describe('analytics state persistence', () => {
  beforeEach(() => {
    analyticsMocks.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zura-analytics-state-'))
    analyticsMocks.version = '1.0.0'
    process.env.ZURA_POSTHOG_PROJECT_KEY = ''
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true }))
    )
  })

  afterEach(async () => {
    const { resetAnalyticsStateForTests } = await import('./service')
    resetAnalyticsStateForTests()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    delete process.env.ZURA_POSTHOG_PROJECT_KEY
    fs.rmSync(analyticsMocks.userDataDir, { recursive: true, force: true })
    vi.resetModules()
  })

  it('establishes a state file with a stable install id on first run', async () => {
    const { getAnalyticsState } = await import('./service')

    const first = getAnalyticsState()
    expect(first.anonymousInstallId).toBeTruthy()
    expect(first.consentState).toBe('undecided')
    expect(first.analyticsEnabled).toBe(false)

    const persisted = JSON.parse(fs.readFileSync(statePath(), 'utf8'))
    expect(persisted.anonymousInstallId).toBe(first.anonymousInstallId)
  })

  it('writes state atomically and leaves no temp files behind', async () => {
    const { setAnalyticsEnabled } = await import('./service')
    await setAnalyticsEnabled(true)

    const leftovers = fs
      .readdirSync(analyticsMocks.userDataDir)
      .filter((name) => name.includes('.tmp'))
    expect(leftovers).toEqual([])
    // The written document must always be complete and parseable.
    expect(() => JSON.parse(fs.readFileSync(statePath(), 'utf8'))).not.toThrow()
  })

  it('quarantines a corrupt state file instead of overwriting the evidence', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    writeState('{ "anonymousInstallId": "abc", trunc')

    const { getAnalyticsState } = await import('./service')
    const state = getAnalyticsState()

    // Fails closed: consent is not silently inherited from unreadable bytes.
    expect(state.consentState).toBe('undecided')
    expect(state.analyticsEnabled).toBe(false)

    const quarantined = quarantinedFiles()
    expect(quarantined).toHaveLength(1)
    expect(fs.readFileSync(path.join(analyticsMocks.userDataDir, quarantined[0]), 'utf8')).toBe(
      '{ "anonymousInstallId": "abc", trunc'
    )
  })

  it('quarantines a non-object root', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    writeState(JSON.stringify([1, 2, 3]))

    const { getAnalyticsState } = await import('./service')
    getAnalyticsState()

    expect(quarantinedFiles()).toHaveLength(1)
  })

  it('does not rewrite the file when persisted state already matches', async () => {
    const { getAnalyticsState, resetAnalyticsStateForTests } = await import('./service')
    getAnalyticsState()
    const firstContents = fs.readFileSync(statePath(), 'utf8')
    const firstMtime = fs.statSync(statePath()).mtimeMs

    resetAnalyticsStateForTests()
    getAnalyticsState()

    expect(fs.readFileSync(statePath(), 'utf8')).toBe(firstContents)
    expect(fs.statSync(statePath()).mtimeMs).toBe(firstMtime)
  })

  it('preserves consent and install id across reloads', async () => {
    const service = await import('./service')
    // Enabling implies accepted consent.
    await service.setAnalyticsEnabled(true)
    const before = service.getAnalyticsState()
    expect(before.analyticsEnabled).toBe(true)

    service.resetAnalyticsStateForTests()
    const after = service.getAnalyticsState()

    expect(after.anonymousInstallId).toBe(before.anonymousInstallId)
    expect(after.consentState).toBe('accepted')
    expect(after.analyticsEnabled).toBe(true)
  })

  it('does not overwrite recoverable state when the read fails operationally', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    // A directory in place of the file yields EISDIR, standing in for any
    // operational failure. The old code caught everything and immediately wrote
    // an empty object back, destroying install id and consent.
    fs.rmSync(statePath(), { force: true })
    fs.mkdirSync(statePath(), { recursive: true })

    const { getAnalyticsState } = await import('./service')
    const state = getAnalyticsState()

    // Fails closed in memory...
    expect(state.analyticsEnabled).toBe(false)
    expect(state.consentState).toBe('undecided')
    // ...but the path is untouched: still a directory, no write-back happened.
    expect(fs.statSync(statePath()).isDirectory()).toBe(true)
    expect(quarantinedFiles()).toHaveLength(0)
  })

  it('recovers on a later call once a transient read failure clears', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    fs.rmSync(statePath(), { force: true })
    fs.mkdirSync(statePath(), { recursive: true })

    const { getAnalyticsState } = await import('./service')
    getAnalyticsState()

    // The failing read must not be latched into the module cache.
    fs.rmdirSync(statePath())
    writeState(
      JSON.stringify({
        anonymousInstallId: 'restored-id',
        consentState: 'accepted',
        analyticsEnabled: true,
        firstLaunchSent: true,
        lastSeenVersion: '1.0.0',
      })
    )

    const recovered = getAnalyticsState()
    expect(recovered.anonymousInstallId).toBe('restored-id')
    expect(recovered.consentState).toBe('accepted')
    expect(recovered.analyticsEnabled).toBe(true)
  })
})

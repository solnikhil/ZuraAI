import { randomUUID } from 'crypto'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'

import { log } from '../startup/logger'
import { writeFileAtomicSync } from '../utils/atomicFile'
import {
  parseJsonStoreRoot,
  quarantineCorruptStoreSync,
  readJsonStoreFileSync,
} from '../utils/jsonStore'

const analyticsLog = log.withTag('analytics')

import {
  isAnalyticsEventName,
  sanitizeAnalyticsProperties,
  sanitizeErrorCategory,
  type AnalyticsEventName,
  type AnalyticsProperties,
  type AnalyticsState,
} from './events'
import { DEFAULT_POSTHOG_HOST, DEFAULT_POSTHOG_PROJECT_KEY } from './config'

interface PersistedAnalyticsState {
  analyticsEnabled?: boolean
  anonymousInstallId?: string
  firstLaunchSent?: boolean
  lastSeenVersion?: string
  consentState?: AnalyticsState['consentState']
}

const STORAGE_FILE = 'analytics-state.json'
const MAX_ERROR_CODE_LENGTH = 80

let state: AnalyticsState | null = null
let storagePath: string | null = null

function getProjectKey(): string {
  if (Object.prototype.hasOwnProperty.call(process.env, 'ZURA_POSTHOG_PROJECT_KEY')) {
    return (process.env.ZURA_POSTHOG_PROJECT_KEY || '').trim()
  }

  if (Object.prototype.hasOwnProperty.call(process.env, 'POSTHOG_PROJECT_KEY')) {
    return (process.env.POSTHOG_PROJECT_KEY || '').trim()
  }

  return DEFAULT_POSTHOG_PROJECT_KEY.trim()
}

function getPostHogHost(): string {
  return (process.env.ZURA_POSTHOG_HOST || DEFAULT_POSTHOG_HOST).replace(/\/+$/, '')
}

function getStoragePath(): string {
  if (!storagePath) {
    storagePath = path.join(app.getPath('userData'), STORAGE_FILE)
  }
  return storagePath
}

/**
 * Outcome of loading persisted analytics state.
 *
 * `corrupt` is kept distinct from `missing` so a damaged file is never silently
 * treated as a fresh install: that would reset the install id, consent, and
 * launch/update markers while destroying the evidence.
 */
type AnalyticsStateLoad =
  | { status: 'missing' }
  | { status: 'loaded'; persisted: PersistedAnalyticsState }
  | { status: 'corrupt'; quarantinePath: string | null }

function readPersistedState(): AnalyticsStateLoad {
  // Operational failures (EACCES, EIO, ...) are not "no state": they must not
  // trigger a write-back that overwrites recoverable state.
  const file = readJsonStoreFileSync(getStoragePath())
  if (file.status === 'missing') {
    return { status: 'missing' }
  }

  try {
    return { status: 'loaded', persisted: parseJsonStoreRoot(file.raw) as PersistedAnalyticsState }
  } catch (error) {
    const quarantinePath = quarantineCorruptStoreSync(getStoragePath(), (message) =>
      analyticsLog.warn(message)
    )
    analyticsLog.error(
      `analytics state is corrupt${
        quarantinePath
          ? ` and was quarantined to ${quarantinePath}`
          : ' and could not be quarantined'
      }: ${error instanceof Error ? error.message : String(error)}`
    )
    return { status: 'corrupt', quarantinePath }
  }
}

function writePersistedState(nextState: AnalyticsState): void {
  try {
    fs.mkdirSync(path.dirname(getStoragePath()), { recursive: true })
    const persisted: PersistedAnalyticsState = {
      analyticsEnabled: nextState.analyticsEnabled,
      anonymousInstallId: nextState.anonymousInstallId,
      firstLaunchSent: nextState.firstLaunchSent,
      lastSeenVersion: nextState.lastSeenVersion,
      consentState: nextState.consentState,
    }
    // Atomic: a torn write here would corrupt consent and the install id.
    writeFileAtomicSync(getStoragePath(), JSON.stringify(persisted, null, 2))
  } catch (error) {
    analyticsLog.warn(
      `failed to persist analytics state: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Builds runtime state from a persisted document.
 *
 * Consent fails closed: anything other than an explicit `accepted` consent with
 * `analyticsEnabled === true` disables analytics.
 */
function normalizeState(persisted: PersistedAnalyticsState): AnalyticsState {
  const consentState =
    persisted.consentState === 'accepted' || persisted.consentState === 'declined'
      ? persisted.consentState
      : 'undecided'
  const analyticsEnabled = consentState === 'accepted' && persisted.analyticsEnabled === true

  return {
    analyticsEnabled,
    anonymousInstallId:
      typeof persisted.anonymousInstallId === 'string' && persisted.anonymousInstallId.trim()
        ? persisted.anonymousInstallId.trim()
        : randomUUID(),
    firstLaunchSent: persisted.firstLaunchSent === true,
    lastSeenVersion: typeof persisted.lastSeenVersion === 'string' ? persisted.lastSeenVersion : '',
    consentState,
    hasProjectKey: Boolean(getProjectKey()),
  }
}

/** True when persisting `next` would not change the stored document. */
function matchesPersisted(persisted: PersistedAnalyticsState, next: AnalyticsState): boolean {
  return (
    persisted.analyticsEnabled === next.analyticsEnabled &&
    persisted.anonymousInstallId === next.anonymousInstallId &&
    persisted.firstLaunchSent === next.firstLaunchSent &&
    persisted.lastSeenVersion === next.lastSeenVersion &&
    persisted.consentState === next.consentState
  )
}

function getState(): AnalyticsState {
  if (!state) {
    let load: AnalyticsStateLoad
    try {
      load = readPersistedState()
    } catch (error) {
      // Operational I/O error: the file may be perfectly good and simply
      // unreadable right now. Fail closed in memory, do NOT write back (that
      // would destroy recoverable state), and do not cache so a transient
      // failure can recover on the next call.
      analyticsLog.error(
        `failed to read analytics state, analytics stays disabled for now: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
      return { ...normalizeState({}), hasProjectKey: Boolean(getProjectKey()) }
    }

    const next = normalizeState(load.status === 'loaded' ? load.persisted : {})
    state = next

    // Only write when the document needs establishing or normalization changed
    // it. A corrupt file has already been moved to quarantine, so writing a
    // fresh document here cannot destroy evidence.
    const needsWrite = load.status !== 'loaded' || !matchesPersisted(load.persisted, next)
    if (needsWrite) {
      writePersistedState(next)
    }
  }

  state.hasProjectKey = Boolean(getProjectKey())
  return state
}

function setState(updates: Partial<AnalyticsState>): AnalyticsState {
  const nextState = {
    ...getState(),
    ...updates,
    hasProjectKey: Boolean(getProjectKey()),
  }
  state = nextState
  writePersistedState(nextState)
  return nextState
}

export function getAnalyticsState(): AnalyticsState {
  return { ...getState() }
}

export function resetAnalyticsStateForTests(): void {
  state = null
  storagePath = null
}

export async function setAnalyticsEnabled(enabled: boolean): Promise<AnalyticsState> {
  setState({
    analyticsEnabled: enabled,
    consentState: enabled ? 'accepted' : 'declined',
  })

  if (enabled) {
    await trackFirstLaunchAndStartIfNeeded()
  }

  return getAnalyticsState()
}

async function sendToPostHog(
  eventName: AnalyticsEventName,
  properties: AnalyticsProperties
): Promise<boolean> {
  const projectKey = getProjectKey()
  if (!projectKey) {
    return false
  }

  const currentState = getState()
  if (!currentState.analyticsEnabled) {
    return false
  }

  try {
    const response = await fetch(`${getPostHogHost()}/capture/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: projectKey,
        event: eventName,
        distinct_id: currentState.anonymousInstallId,
        properties: {
          ...properties,
          appVersion: app.getVersion(),
          os: process.platform,
          arch: process.arch,
          eventName,
          timestamp: new Date().toISOString(),
          anonymousInstallId: currentState.anonymousInstallId,
        },
      }),
    })

    return response.ok
  } catch (error) {
    analyticsLog.warn(
      `failed to send analytics event: ${error instanceof Error ? error.message : String(error)}`
    )
    return false
  }
}

export async function trackAnalyticsEvent(
  eventName: AnalyticsEventName,
  properties?: AnalyticsProperties
): Promise<boolean> {
  if (!isAnalyticsEventName(eventName)) {
    return false
  }

  return sendToPostHog(eventName, sanitizeAnalyticsProperties(properties))
}

async function trackFirstLaunchAndStartIfNeeded(): Promise<void> {
  const currentState = getState()
  if (!currentState.firstLaunchSent) {
    const sent = await trackAnalyticsEvent('app_first_launch')
    if (sent) {
      setState({ firstLaunchSent: true })
    }
  }
  await trackAnalyticsEvent('app_start')
}

export async function trackStartupAnalytics(): Promise<void> {
  const currentVersion = app.getVersion()
  const previousVersion = getState().lastSeenVersion

  if (getState().analyticsEnabled && previousVersion && previousVersion !== currentVersion) {
    await trackAnalyticsEvent('app_update_installed', {
      previousVersion,
      currentVersion,
    })
  }

  if (getState().analyticsEnabled) {
    await trackFirstLaunchAndStartIfNeeded()
  }

  setState({ lastSeenVersion: currentVersion })
}

export function trackAppError(properties: AnalyticsProperties): void {
  void trackAnalyticsEvent('app_error', {
    category: sanitizeErrorCategory(properties.category ?? properties.code),
    code: sanitizeErrorCode(properties.code),
    processType: properties.processType,
    fatal: properties.fatal,
  })
}

export function trackAppCrash(properties: AnalyticsProperties): void {
  void trackAnalyticsEvent('app_crash', {
    category: sanitizeErrorCategory(properties.category ?? properties.code),
    code: sanitizeErrorCode(properties.code),
    processType: properties.processType,
    fatal: properties.fatal ?? true,
  })
}

function sanitizeErrorCode(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return 'unknown'
  return value.replace(/[A-Z]:\\[^:\s]+/gi, '[path]').slice(0, MAX_ERROR_CODE_LENGTH)
}

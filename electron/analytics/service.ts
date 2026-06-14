import { randomUUID } from 'crypto'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'

import {
  isAnalyticsEventName,
  sanitizeAnalyticsProperties,
  sanitizeErrorCategory,
  type AnalyticsEventName,
  type AnalyticsProperties,
  type AnalyticsState,
} from './events'

interface PersistedAnalyticsState {
  analyticsEnabled?: boolean
  anonymousInstallId?: string
  firstLaunchSent?: boolean
  lastSeenVersion?: string
  consentState?: AnalyticsState['consentState']
}

const STORAGE_FILE = 'analytics-state.json'
const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com'
const MAX_ERROR_CODE_LENGTH = 80

let state: AnalyticsState | null = null
let storagePath: string | null = null

function getProjectKey(): string {
  return (
    process.env.ZURA_POSTHOG_PROJECT_KEY ||
    process.env.POSTHOG_PROJECT_KEY ||
    ''
  ).trim()
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

function readPersistedState(): PersistedAnalyticsState {
  try {
    const raw = fs.readFileSync(getStoragePath(), 'utf8')
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed
      : {}
  } catch {
    return {}
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
    fs.writeFileSync(getStoragePath(), JSON.stringify(persisted, null, 2), 'utf8')
  } catch (error) {
    console.warn('[analytics] Failed to persist analytics state:', error)
  }
}

function normalizeState(persisted: PersistedAnalyticsState): AnalyticsState {
  const consentState =
    persisted.consentState === 'accepted' || persisted.consentState === 'declined'
      ? persisted.consentState
      : 'undecided'
  const analyticsEnabled =
    consentState === 'accepted' && persisted.analyticsEnabled === true

  return {
    analyticsEnabled,
    anonymousInstallId:
      typeof persisted.anonymousInstallId === 'string' && persisted.anonymousInstallId.trim()
        ? persisted.anonymousInstallId.trim()
        : randomUUID(),
    firstLaunchSent: persisted.firstLaunchSent === true,
    lastSeenVersion:
      typeof persisted.lastSeenVersion === 'string' ? persisted.lastSeenVersion : '',
    consentState,
    hasProjectKey: Boolean(getProjectKey()),
  }
}

function getState(): AnalyticsState {
  if (!state) {
    state = normalizeState(readPersistedState())
    writePersistedState(state)
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

async function sendToPostHog(eventName: AnalyticsEventName, properties: AnalyticsProperties): Promise<boolean> {
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
    console.warn('[analytics] Failed to send analytics event:', error)
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

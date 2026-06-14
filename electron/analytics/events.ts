export const ANALYTICS_EVENTS = [
  'app_first_launch',
  'app_start',
  'app_update_installed',
  'chat_message_sent',
  'provider_used',
  'model_used',
  'tool_used',
  'web_search_used',
  'mcp_server_connected',
  'overlay_opened',
  'app_error',
  'app_crash',
] as const

export type AnalyticsEventName = typeof ANALYTICS_EVENTS[number]

export type AnalyticsConsentState = 'undecided' | 'accepted' | 'declined'

export interface AnalyticsState {
  analyticsEnabled: boolean
  anonymousInstallId: string
  firstLaunchSent: boolean
  lastSeenVersion: string
  consentState: AnalyticsConsentState
  hasProjectKey: boolean
}

export type AnalyticsProperties = Record<string, unknown>

export const ANALYTICS_EVENT_SET = new Set<string>(ANALYTICS_EVENTS)

const COMMON_ALLOWED_PROPERTIES = new Set([
  'provider',
  'model',
  'assistantMode',
  'hasAttachments',
  'toolName',
  'success',
  'durationMs',
  'errorCategory',
  'transport',
  'serverTrustState',
  'source',
  'category',
  'code',
  'processType',
  'fatal',
  'previousVersion',
  'currentVersion',
])

export function isAnalyticsEventName(value: unknown): value is AnalyticsEventName {
  return typeof value === 'string' && ANALYTICS_EVENT_SET.has(value)
}

export function sanitizeAnalyticsProperties(input: unknown): AnalyticsProperties {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return {}
  }

  const sanitized: AnalyticsProperties = {}
  for (const [key, value] of Object.entries(input)) {
    if (!COMMON_ALLOWED_PROPERTIES.has(key)) continue

    if (typeof value === 'string') {
      sanitized[key] = value.slice(0, 160)
    } else if (typeof value === 'boolean') {
      sanitized[key] = value
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      sanitized[key] = Math.round(value)
    }
  }

  return sanitized
}

export function sanitizeErrorCategory(value: unknown): string {
  const raw = typeof value === 'string' ? value.toLowerCase() : ''
  if (raw.includes('auth') || raw.includes('key') || raw.includes('401') || raw.includes('403')) {
    return 'auth'
  }
  if (raw.includes('rate') || raw.includes('429')) {
    return 'rate_limit'
  }
  if (raw.includes('network') || raw.includes('fetch') || raw.includes('timeout')) {
    return 'network'
  }
  if (raw.includes('tool')) {
    return 'tool'
  }
  if (raw.includes('provider')) {
    return 'provider'
  }
  return 'other'
}

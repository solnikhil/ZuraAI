// ---------------------------------------------------------------------------
// Web-search failure logging (web-search-backend-rebuild)
//
// The single, dedicated logging helper for the rebuilt Tavily-only pipeline.
// The orchestrator (`service.ts`) imports `logWebSearchFailure` and calls it on
// the failure path. This module deliberately records ONLY non-secret fields and
// redacts the Tavily API key if it would ever appear in a logged string.
//
// Logged fields (and ONLY these):
//   - stage      : where in the pipeline the failure happened
//   - intent     : the classified WebInputIntent (optional)
//   - hasApiKey  : boolean presence flag (NEVER the key value)
//   - error      : error description truncated to 200 chars (Req 12.1)
//   - query      : query truncated to 80 chars (Req 12.3)
//
// The `apiKey` argument is accepted ONLY so the helper can redact it from any
// logged string (Req 12.4). It is NEVER written to the log itself (Req 12.2).
// ---------------------------------------------------------------------------

const MAX_ERROR_LOG_LENGTH = 200
const MAX_QUERY_LOG_LENGTH = 80
const REDACTION_PLACEHOLDER = '[REDACTED]'

/**
 * Pure string truncation. Returns `value` unchanged when it is within `max`
 * characters; otherwise returns the first `max` characters with a trailing
 * ellipsis so the total length never exceeds `max`.
 */
export function truncate(value: string, max: number): string {
  if (max <= 0) {
    return ''
  }

  if (value.length <= max) {
    return value
  }

  if (max <= 3) {
    return value.slice(0, max)
  }

  return `${value.slice(0, max - 3)}...`
}

/**
 * Replace every occurrence of `apiKey` in `value` with a redaction placeholder.
 * No-op when `apiKey` is empty/whitespace-only so we never redact on an empty
 * needle (which would otherwise corrupt the output).
 */
export function redactApiKey(value: string, apiKey?: string): string {
  if (!apiKey) {
    return value
  }

  const needle = apiKey.trim()
  if (!needle) {
    return value
  }

  return value.split(needle).join(REDACTION_PLACEHOLDER)
}

/**
 * Log a single web-search failure with only non-secret fields.
 *
 * The Tavily API key is never written into any field. When `apiKey` is
 * provided, every logged string is scanned and any occurrence of the key is
 * replaced with `[REDACTED]` before emitting (Req 12.4). Presence is conveyed
 * solely through the `hasApiKey` boolean (Req 12.2).
 */
export function logWebSearchFailure(details: {
  stage: string
  intent?: string
  hasApiKey: boolean
  error: string
  query?: string
  // Optional: passed only so the helper can redact it if it appears in any
  // logged field. NEVER logged itself.
  apiKey?: string
}): void {
  const { stage, intent, hasApiKey, error, query, apiKey } = details

  const safeError = redactApiKey(truncate(error, MAX_ERROR_LOG_LENGTH), apiKey)
  const safeStage = redactApiKey(stage, apiKey)
  const safeIntent = intent === undefined ? undefined : redactApiKey(intent, apiKey)
  const safeQuery =
    query === undefined ? undefined : redactApiKey(truncate(query, MAX_QUERY_LOG_LENGTH), apiKey)

  const record: {
    stage: string
    intent?: string
    hasApiKey: boolean
    error: string
    query?: string
  } = {
    stage: safeStage,
    intent: safeIntent,
    hasApiKey,
    error: safeError,
    query: safeQuery,
  }

  console.error('[web_search] request failed', record)
}

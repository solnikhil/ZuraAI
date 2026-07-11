const SECRET_PATTERNS = [
  /\b(?:gho|ghu|ghp|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~-]+\b/gi,
]

export function redactGitHubSecrets(value: string): string {
  return SECRET_PATTERNS.reduce((result, pattern) => result.replace(pattern, '[REDACTED]'), value)
}

export function isValidGitHubDeviceUserCode(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(value)
}

export function isGitHubDeviceFlowExpired(now: number, expiresAt: number): boolean {
  return !Number.isFinite(expiresAt) || now >= expiresAt
}

export type GitHubDevicePollDecision =
  | { kind: 'authorized'; token: string }
  | { kind: 'retry'; intervalSeconds: number }
  | { kind: 'denied'; message: string }
  | { kind: 'expired'; message: string }
  | { kind: 'error'; message: string }

export function classifyGitHubDevicePoll(
  result: { access_token?: unknown; error?: unknown; error_description?: unknown },
  intervalSeconds: number
): GitHubDevicePollDecision {
  if (typeof result.access_token === 'string' && result.access_token) {
    return { kind: 'authorized', token: result.access_token }
  }
  if (result.error === 'authorization_pending') {
    return { kind: 'retry', intervalSeconds }
  }
  if (result.error === 'slow_down') {
    return { kind: 'retry', intervalSeconds: intervalSeconds + 5 }
  }
  if (result.error === 'access_denied') {
    return { kind: 'denied', message: 'GitHub sign-in was cancelled.' }
  }
  if (result.error === 'expired_token') {
    return { kind: 'expired', message: 'The GitHub sign-in code expired. Try again.' }
  }
  const description = typeof result.error_description === 'string'
    ? redactGitHubSecrets(result.error_description)
    : 'GitHub sign-in failed.'
  return { kind: 'error', message: description }
}

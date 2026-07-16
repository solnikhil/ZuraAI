import type { McpDraftConfigValue, McpDraftServer } from './draftModel'

export function validateDraftServer(draft: McpDraftServer): string[] {
  const errors: string[] = []

  if (!draft.name.trim()) errors.push('Server name is required.')
  if (draft.transport === 'stdio' && !draft.command.trim()) {
    errors.push('A stdio server needs a command.')
  }
  if (draft.transport !== 'stdio') {
    const url = draft.url.trim()
    if (!url) {
      errors.push('A remote server needs a URL.')
    } else {
      try {
        if (!new URL(url).protocol) errors.push('Remote server URL is invalid.')
      } catch {
        errors.push('Remote server URL is invalid.')
      }
    }
  }

  validateConfigEntries('Environment variable', draft.env, errors)
  validateConfigEntries('Header', draft.headers, errors)
  if (draft.authToken) validateSecretEntry('Auth token', draft.authToken, errors)
  validateNumericField('Startup timeout', draft.startupTimeoutMs, errors)
  validateNumericField('Tool timeout', draft.toolTimeoutMs, errors)
  validateNumericField('Reconnect attempts', draft.reconnectAttempts, errors)
  validateNumericField('Reconnect delay', draft.reconnectDelayMs, errors)
  validateToolPolicy(draft.toolAllowlistText, draft.toolBlocklistText, errors)

  return [...new Set(errors)]
}

function validateConfigEntries(
  label: string,
  entries: McpDraftConfigValue[],
  errors: string[]
): void {
  const seenNames = new Set<string>()
  for (const entry of entries) {
    const name = entry.name.trim()
    if (!name) {
      errors.push(`${label} name is required.`)
      continue
    }
    const normalizedName = name.toLowerCase()
    if (seenNames.has(normalizedName)) {
      errors.push(`${label}s must use unique names.`)
      continue
    }
    seenNames.add(normalizedName)
    validateSecretEntry(`${label} ${name}`, entry, errors)
  }
}

function validateSecretEntry(label: string, entry: McpDraftConfigValue, errors: string[]): void {
  if (entry.valueSource !== 'secret') return
  const hasStoredSecret = entry.secretStored && !entry.clearSecret
  const hasNewSecret = entry.secretValue.trim().length > 0
  if (!hasStoredSecret && !hasNewSecret) {
    errors.push(`${label} needs a secret value or a stored secret.`)
  }
}

function validateNumericField(label: string, rawValue: string, errors: string[]): void {
  const trimmed = rawValue.trim()
  if (!trimmed) return
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    errors.push(`${label} must be a non-negative whole number.`)
  }
}

function validateToolPolicy(
  allowlistText: string | undefined,
  blocklistText: string | undefined,
  errors: string[]
): void {
  const parse = (value: string | undefined) =>
    new Set(
      (value ?? '')
        .split(/\r?\n/)
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean)
    )
  const allowlist = parse(allowlistText)
  const blocklist = parse(blocklistText)
  for (const toolName of allowlist) {
    if (blocklist.has(toolName)) {
      errors.push(
        `Tool policy conflict: "${toolName}" appears in both the allowlist and blocklist.`
      )
    }
  }
}

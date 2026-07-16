import { createHash, randomUUID } from 'node:crypto'

const AUTHORIZATION_TTL_MS = 60_000
const MAX_PENDING_AUTHORIZATIONS = 200

interface PendingAuthorization {
  senderId: number
  signature: string
  expiresAt: number
}

const pendingAuthorizations = new Map<string, PendingAuthorization>()

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`
}

export function buildToolApprovalSignature(
  toolName: string,
  args: Record<string, unknown>
): string {
  return createHash('sha256')
    .update(`${toolName}\0${stableStringify(args)}`)
    .digest('hex')
}

export function issueToolApprovalAuthorization(
  senderId: number,
  toolName: string,
  args: Record<string, unknown>
): string {
  pruneExpiredAuthorizations()
  while (pendingAuthorizations.size >= MAX_PENDING_AUTHORIZATIONS) {
    const oldest = pendingAuthorizations.keys().next().value
    if (typeof oldest !== 'string') break
    pendingAuthorizations.delete(oldest)
  }

  const token = randomUUID()
  pendingAuthorizations.set(token, {
    senderId,
    signature: buildToolApprovalSignature(toolName, args),
    expiresAt: Date.now() + AUTHORIZATION_TTL_MS,
  })
  return token
}

export function consumeToolApprovalAuthorization(
  token: unknown,
  senderId: number,
  toolName: string,
  args: Record<string, unknown>
): boolean {
  if (typeof token !== 'string' || !token) return false
  const authorization = pendingAuthorizations.get(token)
  pendingAuthorizations.delete(token)
  if (!authorization || authorization.expiresAt < Date.now()) return false
  return (
    authorization.senderId === senderId &&
    authorization.signature === buildToolApprovalSignature(toolName, args)
  )
}

export function clearToolApprovalAuthorizations(): void {
  pendingAuthorizations.clear()
}

function pruneExpiredAuthorizations(): void {
  const now = Date.now()
  for (const [token, authorization] of pendingAuthorizations) {
    if (authorization.expiresAt < now) pendingAuthorizations.delete(token)
  }
}

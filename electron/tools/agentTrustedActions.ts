import { randomUUID } from 'node:crypto'

import { getSecureValueAsync, setSecureValueAsync } from '../secureStorage'

const STORAGE_KEY = 'agentApprovalTrustedToolSignatures'
const STORAGE_VERSION = 1
const MAX_ACTIONS = 200
const SIGNATURE_PATTERN = /^[a-f0-9]{64}$/
const ACTION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type AgentTrustedActionRiskClass = 'standard' | 'elevated' | 'high' | 'unknown'

export interface AgentTrustedActionMetadata {
  id: string
  toolName: string
  riskClass: AgentTrustedActionRiskClass
  createdAt: number
  lastUsedAt: number
}

interface StoredTrustedAction extends AgentTrustedActionMetadata {
  signature: string
}

interface PersistedTrustedActions {
  version: 1
  actions: StoredTrustedAction[]
}

let actionsBySignature: Map<string, StoredTrustedAction> | null = null
let mutationQueue: Promise<void> = Promise.resolve()

function copyMetadata(action: StoredTrustedAction): AgentTrustedActionMetadata {
  const { signature: _signature, ...metadata } = action
  return { ...metadata }
}

function normalizeToolName(value: unknown): string {
  if (typeof value !== 'string') return 'Unknown tool'
  const normalized = value.replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 100)
  return normalized || 'Unknown tool'
}

function normalizeRiskClass(value: unknown): AgentTrustedActionRiskClass {
  return value === 'standard' || value === 'elevated' || value === 'high' ? value : 'unknown'
}

function normalizeTimestamp(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : fallback
}

function normalizeStoredAction(value: unknown, now: number): StoredTrustedAction | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (typeof record.signature !== 'string' || !SIGNATURE_PATTERN.test(record.signature)) return null
  const createdAt = normalizeTimestamp(record.createdAt, now)
  return {
    id:
      typeof record.id === 'string' && ACTION_ID_PATTERN.test(record.id) ? record.id : randomUUID(),
    signature: record.signature,
    toolName: normalizeToolName(record.toolName),
    riskClass: normalizeRiskClass(record.riskClass),
    createdAt,
    lastUsedAt: normalizeTimestamp(record.lastUsedAt, createdAt),
  }
}

async function loadActions(): Promise<Map<string, StoredTrustedAction>> {
  if (actionsBySignature) return actionsBySignature
  const now = Date.now()
  const raw = await getSecureValueAsync(STORAGE_KEY)
  const parsed: unknown = raw.trim() ? (JSON.parse(raw) as unknown) : null

  const rawActions =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>).actions
      : parsed
  const normalized: StoredTrustedAction[] = []
  if (Array.isArray(rawActions)) {
    for (const value of rawActions) {
      if (typeof value === 'string' && SIGNATURE_PATTERN.test(value)) {
        normalized.push({
          id: randomUUID(),
          signature: value,
          toolName: 'Legacy exact-repeat action',
          riskClass: 'unknown',
          createdAt: now,
          lastUsedAt: now,
        })
        continue
      }
      const action = normalizeStoredAction(value, now)
      if (action) normalized.push(action)
    }
  }

  actionsBySignature = new Map(
    normalized.slice(-MAX_ACTIONS).map((action) => [action.signature, action])
  )
  return actionsBySignature
}

async function persistActions(actions: Map<string, StoredTrustedAction>): Promise<void> {
  const payload: PersistedTrustedActions = {
    version: STORAGE_VERSION,
    actions: [...actions.values()].slice(-MAX_ACTIONS),
  }
  if (!(await setSecureValueAsync(STORAGE_KEY, JSON.stringify(payload)))) {
    throw new Error('Trusted actions could not be saved to secure storage.')
  }
}

function serializeMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const operation = mutationQueue.then(mutation, mutation)
  mutationQueue = operation.then(
    () => undefined,
    () => undefined
  )
  return operation
}

export async function listAgentTrustedActions(): Promise<AgentTrustedActionMetadata[]> {
  await mutationQueue
  const actions = await loadActions()
  return [...actions.values()]
    .sort((left, right) => right.lastUsedAt - left.lastUsedAt)
    .map(copyMetadata)
}

export async function useAgentTrustedAction(signature: string): Promise<boolean> {
  if (!SIGNATURE_PATTERN.test(signature)) return false
  return serializeMutation(async () => {
    const current = await loadActions()
    const action = current.get(signature)
    if (!action) return false
    const next = new Map(current)
    next.set(signature, { ...action, lastUsedAt: Date.now() })
    await persistActions(next)
    actionsBySignature = next
    return true
  })
}

export async function trustAgentExactRepeat(
  signature: string,
  toolName: string,
  riskClass: AgentTrustedActionRiskClass
): Promise<AgentTrustedActionMetadata> {
  if (!SIGNATURE_PATTERN.test(signature)) throw new Error('Invalid trusted action signature.')
  return serializeMutation(async () => {
    const current = await loadActions()
    const now = Date.now()
    const existing = current.get(signature)
    const action: StoredTrustedAction = {
      id: existing?.id ?? randomUUID(),
      signature,
      toolName: normalizeToolName(toolName),
      riskClass: normalizeRiskClass(riskClass),
      createdAt: existing?.createdAt ?? now,
      lastUsedAt: now,
    }
    const next = new Map(current)
    next.delete(signature)
    next.set(signature, action)
    while (next.size > MAX_ACTIONS) next.delete(next.keys().next().value as string)
    await persistActions(next)
    actionsBySignature = next
    return copyMetadata(action)
  })
}

export async function revokeAgentTrustedAction(id: string): Promise<boolean> {
  if (!ACTION_ID_PATTERN.test(id)) return false
  return serializeMutation(async () => {
    const current = await loadActions()
    const entry = [...current.entries()].find(([, action]) => action.id === id)
    if (!entry) return false
    const next = new Map(current)
    next.delete(entry[0])
    await persistActions(next)
    actionsBySignature = next
    return true
  })
}

export async function revokeAllAgentTrustedActions(): Promise<number> {
  return serializeMutation(async () => {
    const current = await loadActions()
    const count = current.size
    if (count === 0) return 0
    const next = new Map<string, StoredTrustedAction>()
    await persistActions(next)
    actionsBySignature = next
    return count
  })
}

export function resetAgentTrustedActionsForTests(): void {
  actionsBySignature = null
  mutationQueue = Promise.resolve()
}

import { app } from 'electron'
import { randomUUID } from 'crypto'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as path from 'path'

import { writeFileAtomic } from './utils/atomicFile'

export type CommandCenterWorkflowStep =
  | { type: 'action'; actionId: string }
  | { type: 'app'; appPath: string; label?: string }
  | { type: 'window'; hwnd: number; label?: string }
  | { type: 'ai'; prompt: string }

export interface CommandCenterWorkflow {
  id: string
  name: string
  description?: string
  aliases: string[]
  steps: CommandCenterWorkflowStep[]
  createdAt: number
  updatedAt: number
  lastRunAt?: number
}

const STORE_VERSION = 1

interface WorkflowStoreData {
  version: number
  workflows: CommandCenterWorkflow[]
}

function getStorePath(): string {
  return path.join(app.getPath('userData'), 'command-center-workflows.json')
}

function emptyStore(): WorkflowStoreData {
  return { version: STORE_VERSION, workflows: [] }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeStep(raw: unknown): CommandCenterWorkflowStep | null {
  if (!isRecord(raw)) return null
  if (raw.type === 'action' && typeof raw.actionId === 'string' && raw.actionId.trim()) {
    return { type: 'action', actionId: raw.actionId.trim() }
  }
  if (raw.type === 'app' && typeof raw.appPath === 'string' && raw.appPath.trim()) {
    return {
      type: 'app',
      appPath: raw.appPath.trim(),
      label: typeof raw.label === 'string' ? raw.label.trim() || undefined : undefined,
    }
  }
  if (raw.type === 'window' && typeof raw.hwnd === 'number' && Number.isFinite(raw.hwnd)) {
    return {
      type: 'window',
      hwnd: Math.trunc(raw.hwnd),
      label: typeof raw.label === 'string' ? raw.label.trim() || undefined : undefined,
    }
  }
  if (raw.type === 'ai' && typeof raw.prompt === 'string' && raw.prompt.trim()) {
    return { type: 'ai', prompt: raw.prompt.trim() }
  }
  return null
}

function normalizeWorkflow(raw: unknown): CommandCenterWorkflow | null {
  if (!isRecord(raw)) return null
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  const steps = Array.isArray(raw.steps)
    ? raw.steps
        .map(normalizeStep)
        .filter((step): step is CommandCenterWorkflowStep => Boolean(step))
    : []
  if (!id || !name || steps.length === 0) return null
  return {
    id,
    name,
    description:
      typeof raw.description === 'string' ? raw.description.trim() || undefined : undefined,
    aliases: Array.isArray(raw.aliases)
      ? raw.aliases
          .filter((alias): alias is string => typeof alias === 'string')
          .map((alias) => alias.trim())
          .filter(Boolean)
      : [],
    steps,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
    lastRunAt: typeof raw.lastRunAt === 'number' ? raw.lastRunAt : undefined,
  }
}

function normalizeStore(raw: unknown): WorkflowStoreData {
  if (!isRecord(raw)) return emptyStore()
  return {
    version: STORE_VERSION,
    workflows: Array.isArray(raw.workflows)
      ? raw.workflows
          .map(normalizeWorkflow)
          .filter((workflow): workflow is CommandCenterWorkflow => Boolean(workflow))
      : [],
  }
}

export async function listCommandCenterWorkflows(): Promise<CommandCenterWorkflow[]> {
  try {
    if (!fsSync.existsSync(getStorePath())) return []
    const raw = await fs.readFile(getStorePath(), 'utf8')
    return normalizeStore(JSON.parse(raw)).workflows
  } catch (error) {
    console.error('[CommandCenter] Failed to read workflows:', error)
    return []
  }
}

async function writeWorkflows(workflows: CommandCenterWorkflow[]): Promise<void> {
  await writeFileAtomic(
    getStorePath(),
    JSON.stringify({ version: STORE_VERSION, workflows }, null, 2)
  )
}

export async function saveCommandCenterWorkflow(
  input: unknown
): Promise<CommandCenterWorkflow | null> {
  const now = Date.now()
  const normalized = normalizeWorkflow({
    ...(isRecord(input) ? input : {}),
    id:
      isRecord(input) && typeof input.id === 'string' && input.id.trim() ? input.id : randomUUID(),
    createdAt: isRecord(input) && typeof input.createdAt === 'number' ? input.createdAt : now,
    updatedAt: now,
  })
  if (!normalized) return null

  const workflows = await listCommandCenterWorkflows()
  const next = [normalized, ...workflows.filter((workflow) => workflow.id !== normalized.id)]
  await writeWorkflows(next)
  return normalized
}

export async function deleteCommandCenterWorkflow(id: unknown): Promise<boolean> {
  if (typeof id !== 'string' || !id.trim()) return false
  const workflows = await listCommandCenterWorkflows()
  const next = workflows.filter((workflow) => workflow.id !== id)
  if (next.length === workflows.length) return false
  await writeWorkflows(next)
  return true
}

export async function markCommandCenterWorkflowRun(id: string): Promise<void> {
  const workflows = await listCommandCenterWorkflows()
  await writeWorkflows(
    workflows.map((workflow) =>
      workflow.id === id ? { ...workflow, lastRunAt: Date.now(), updatedAt: Date.now() } : workflow
    )
  )
}

import { BrowserWindow, ipcMain } from 'electron'
import * as memoryStore from '../memoryStore'
import * as summaryStore from '../conversationSummaryStore'
import type { AddMemoryInput, MemoryScope, UpdateMemoryPatch } from '../memoryStore'

const MEMORY_CHANGED_CHANNEL = 'memory-store:changed'

function broadcastMemoryStoreChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue
    window.webContents.send(MEMORY_CHANGED_CHANNEL)
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sanitizeScope(value: unknown): MemoryScope | undefined {
  if (!isPlainObject(value)) return undefined
  if (value.type === 'global') return { type: 'global' }
  if (
    value.type === 'project' &&
    typeof value.projectId === 'string' &&
    value.projectId.length > 0
  ) {
    return { type: 'project', projectId: value.projectId }
  }
  return undefined
}

function sanitizeAddInput(raw: unknown): AddMemoryInput {
  if (!isPlainObject(raw)) {
    throw new Error('Invalid memory payload')
  }
  if (typeof raw.content !== 'string') {
    throw new Error('Memory content must be a string')
  }
  const result: AddMemoryInput = { content: raw.content }
  if (raw.source === 'user' || raw.source === 'model') {
    result.source = raw.source
  }
  if (typeof raw.sessionId === 'string' && raw.sessionId.length > 0) {
    result.sessionId = raw.sessionId
  }
  if (raw.origin === 'tool' || raw.origin === 'background') {
    result.origin = raw.origin
  }
  const scope = sanitizeScope(raw.scope)
  if (scope) {
    result.scope = scope
  }
  return result
}

function sanitizeUpdatePatch(raw: unknown): UpdateMemoryPatch {
  if (!isPlainObject(raw)) {
    throw new Error('Invalid memory patch')
  }
  const patch: UpdateMemoryPatch = {}
  if (raw.content !== undefined) {
    if (typeof raw.content !== 'string') {
      throw new Error('Memory content must be a string')
    }
    patch.content = raw.content
  }
  const scope = sanitizeScope(raw.scope)
  if (scope) {
    patch.scope = scope
  }
  return patch
}

/** Registers main-process handlers for the memory store. */
export function registerMemoryStoreHandlers(): void {
  ipcMain.handle('memory:list', async (_event, rawScope?: unknown) => {
    const scope = sanitizeScope(rawScope)
    return memoryStore.getAllMemoriesAsync(scope)
  })

  ipcMain.handle('memory:add', async (_event, payload: unknown) => {
    const input = sanitizeAddInput(payload)
    const memory = await memoryStore.addMemoryAsync(input)
    broadcastMemoryStoreChanged()
    return memory
  })

  ipcMain.handle('memory:add-deduped', async (_event, payload: unknown, rawOptions?: unknown) => {
    const input = sanitizeAddInput(payload)
    const options: memoryStore.DedupeAddOptions = {}
    if (
      isPlainObject(rawOptions) &&
      typeof rawOptions.supersedesId === 'string' &&
      rawOptions.supersedesId.length > 0
    ) {
      options.supersedesId = rawOptions.supersedesId
    }
    const result = await memoryStore.addMemoryWithDedupeAsync(input, options)
    if (result.operation !== 'noop') broadcastMemoryStoreChanged()
    return result
  })

  ipcMain.handle('memory:update', async (_event, id: unknown, patch: unknown) => {
    if (typeof id !== 'string' || !id.trim()) {
      throw new Error('Invalid memory id')
    }
    const sanitizedPatch = sanitizeUpdatePatch(patch)
    const memory = await memoryStore.updateMemoryAsync(id, sanitizedPatch)
    if (memory) broadcastMemoryStoreChanged()
    return memory
  })

  ipcMain.handle('memory:delete', async (_event, id: unknown) => {
    if (typeof id !== 'string' || !id.trim()) {
      throw new Error('Invalid memory id')
    }
    const deleted = await memoryStore.deleteMemoryAsync(id)
    if (deleted) broadcastMemoryStoreChanged()
    return deleted
  })

  ipcMain.handle('memory:clear', async () => {
    await memoryStore.clearAllMemoriesAsync()
    broadcastMemoryStoreChanged()
    return true
  })

  ipcMain.handle(
    'memory:search',
    async (_event, query: unknown, limit?: unknown, rawScope?: unknown) => {
      if (typeof query !== 'string') {
        throw new Error('Invalid memory search query')
      }
      const numericLimit = typeof limit === 'number' && limit > 0 ? Math.min(limit, 50) : 10
      const scope = sanitizeScope(rawScope)
      return memoryStore.searchMemoriesAsync(query, numericLimit, scope)
    }
  )

  ipcMain.handle('memory:summaries-list', async () => {
    return summaryStore.getAllSummariesAsync()
  })

  ipcMain.handle('memory:summaries-upsert', async (_event, sessionId: unknown, summary: unknown) => {
    if (typeof sessionId !== 'string' || !sessionId.trim()) {
      throw new Error('Invalid conversation summary sessionId')
    }
    if (typeof summary !== 'string') {
      throw new Error('Conversation summary must be a string')
    }
    const result = await summaryStore.upsertSummaryAsync(sessionId, summary)
    broadcastMemoryStoreChanged()
    return result
  })
}

/** Removes all memory store handlers. Symmetric with {@link registerMemoryStoreHandlers}. */
export function unregisterMemoryStoreHandlers(): void {
  ipcMain.removeHandler('memory:list')
  ipcMain.removeHandler('memory:add')
  ipcMain.removeHandler('memory:add-deduped')
  ipcMain.removeHandler('memory:update')
  ipcMain.removeHandler('memory:delete')
  ipcMain.removeHandler('memory:clear')
  ipcMain.removeHandler('memory:search')
  ipcMain.removeHandler('memory:summaries-list')
  ipcMain.removeHandler('memory:summaries-upsert')
}

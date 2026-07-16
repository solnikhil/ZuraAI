import type { ChatIndexData, ChatSession, ChatSessionMetadata, Folder, Message } from '../chatStore'

const MAX_SESSION_COUNT = 10_000
const MAX_FOLDER_COUNT = 10_000
const MAX_MESSAGES_PER_SESSION = 100_000
const MAX_SESSION_BYTES = 256 * 1024 * 1024
const MAX_INDEX_BYTES = 64 * 1024 * 1024
const MAX_IDENTIFIER_LENGTH = 512
const MAX_TITLE_LENGTH = 100_000
const MAX_TAG_COUNT = 10_000
const MAX_PAGE_LIMIT = 500

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
}

function assertString(value: unknown, label: string, maxLength: number): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) {
    throw new Error(`${label} must be a non-empty string of at most ${maxLength} characters`)
  }
}

function assertOptionalString(value: unknown, label: string, maxLength: number): void {
  if (value !== undefined && value !== null) assertString(value, label, maxLength)
}

function assertFiniteNumber(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`)
  }
}

function assertBoundedSerializedSize(value: unknown, maxBytes: number, label: string): void {
  let serialized: string
  try {
    serialized = JSON.stringify(value)
  } catch {
    throw new Error(`${label} must be JSON-serializable`)
  }
  if (Buffer.byteLength(serialized, 'utf8') > maxBytes) {
    throw new Error(`${label} exceeds the ${maxBytes}-byte IPC persistence limit`)
  }
}

function assertStringArray(value: unknown, label: string): asserts value is string[] {
  if (!Array.isArray(value) || value.length > MAX_TAG_COUNT) {
    throw new Error(`${label} must be an array with at most ${MAX_TAG_COUNT} entries`)
  }
  value.forEach((entry, index) => assertString(entry, `${label}[${index}]`, MAX_TITLE_LENGTH))
}

function assertMessage(value: unknown, label: string): asserts value is Message {
  assertRecord(value, label)
  assertString(value.id, `${label}.id`, MAX_IDENTIFIER_LENGTH)
  if (value.role !== 'user' && value.role !== 'assistant' && value.role !== 'system') {
    throw new Error(`${label}.role is invalid`)
  }
  if (typeof value.content !== 'string') throw new Error(`${label}.content must be a string`)
  assertFiniteNumber(value.timestamp, `${label}.timestamp`)
  if (value.tokenCount !== undefined) assertFiniteNumber(value.tokenCount, `${label}.tokenCount`)
  if (value.latency !== undefined) assertFiniteNumber(value.latency, `${label}.latency`)
}

export function assertChatSessionInput(
  value: unknown,
  label = 'session'
): asserts value is ChatSession {
  assertRecord(value, label)
  assertString(value.id, `${label}.id`, MAX_IDENTIFIER_LENGTH)
  assertString(value.title, `${label}.title`, MAX_TITLE_LENGTH)
  assertFiniteNumber(value.createdAt, `${label}.createdAt`)
  assertFiniteNumber(value.updatedAt, `${label}.updatedAt`)
  if (!Array.isArray(value.messages) || value.messages.length > MAX_MESSAGES_PER_SESSION) {
    throw new Error(`${label}.messages must contain at most ${MAX_MESSAGES_PER_SESSION} messages`)
  }
  value.messages.forEach((message, index) => assertMessage(message, `${label}.messages[${index}]`))
  if (value.tags !== undefined) assertStringArray(value.tags, `${label}.tags`)
  assertOptionalString(value.folderId, `${label}.folderId`, MAX_IDENTIFIER_LENGTH)
  if (value.totalTokens !== undefined) assertFiniteNumber(value.totalTokens, `${label}.totalTokens`)
  if (value.messageCount !== undefined)
    assertFiniteNumber(value.messageCount, `${label}.messageCount`)
  if (value.artifacts !== undefined && !Array.isArray(value.artifacts)) {
    throw new Error(`${label}.artifacts must be an array`)
  }
  assertBoundedSerializedSize(value, MAX_SESSION_BYTES, label)
}

function assertSessionMetadata(
  value: unknown,
  label: string
): asserts value is ChatSessionMetadata {
  assertRecord(value, label)
  assertString(value.id, `${label}.id`, MAX_IDENTIFIER_LENGTH)
  assertString(value.title, `${label}.title`, MAX_TITLE_LENGTH)
  assertFiniteNumber(value.createdAt, `${label}.createdAt`)
  assertFiniteNumber(value.updatedAt, `${label}.updatedAt`)
  assertFiniteNumber(value.messageCount, `${label}.messageCount`)
  if (typeof value.pinned !== 'boolean') throw new Error(`${label}.pinned must be a boolean`)
  assertOptionalString(value.folderId, `${label}.folderId`, MAX_IDENTIFIER_LENGTH)
  assertStringArray(value.tags, `${label}.tags`)
  if (value.recentMessages !== undefined) {
    if (!Array.isArray(value.recentMessages) || value.recentMessages.length > 20) {
      throw new Error(`${label}.recentMessages must contain at most 20 messages`)
    }
    value.recentMessages.forEach((message, index) => {
      assertRecord(message, `${label}.recentMessages[${index}]`)
      assertString(message.id, `${label}.recentMessages[${index}].id`, MAX_IDENTIFIER_LENGTH)
      if (typeof message.content !== 'string' || message.content.length > 500) {
        throw new Error(`${label}.recentMessages[${index}].content is invalid`)
      }
      if (message.role !== 'user' && message.role !== 'assistant' && message.role !== 'system') {
        throw new Error(`${label}.recentMessages[${index}].role is invalid`)
      }
      assertFiniteNumber(message.timestamp, `${label}.recentMessages[${index}].timestamp`)
    })
  }
}

export function assertFolderInput(value: unknown, label = 'folder'): asserts value is Folder {
  assertRecord(value, label)
  assertString(value.id, `${label}.id`, MAX_IDENTIFIER_LENGTH)
  assertString(value.name, `${label}.name`, MAX_TITLE_LENGTH)
  assertFiniteNumber(value.order, `${label}.order`)
  assertFiniteNumber(value.createdAt, `${label}.createdAt`)
  if (
    value.memoryMode !== undefined &&
    value.memoryMode !== 'default' &&
    value.memoryMode !== 'folder-only'
  ) {
    throw new Error(`${label}.memoryMode is invalid`)
  }
}

export function assertFoldersInput(value: unknown): asserts value is Folder[] {
  if (!Array.isArray(value) || value.length > MAX_FOLDER_COUNT) {
    throw new Error(`folders must contain at most ${MAX_FOLDER_COUNT} entries`)
  }
  value.forEach((folder, index) => assertFolderInput(folder, `folders[${index}]`))
  assertBoundedSerializedSize(value, MAX_INDEX_BYTES, 'folders')
}

export function assertSessionsInput(value: unknown): asserts value is ChatSession[] {
  if (!Array.isArray(value) || value.length > MAX_SESSION_COUNT) {
    throw new Error(`sessions must contain at most ${MAX_SESSION_COUNT} entries`)
  }
  value.forEach((session, index) => assertChatSessionInput(session, `sessions[${index}]`))
}

export function assertChatIndexInput(value: unknown): asserts value is ChatIndexData {
  assertRecord(value, 'index')
  assertFiniteNumber(value.version, 'index.version')
  if (!Number.isInteger(value.version) || value.version < 1) {
    throw new Error('index.version must be a positive integer')
  }
  if (!Array.isArray(value.sessions) || value.sessions.length > MAX_SESSION_COUNT) {
    throw new Error(`index.sessions must contain at most ${MAX_SESSION_COUNT} entries`)
  }
  value.sessions.forEach((session, index) =>
    assertSessionMetadata(session, `index.sessions[${index}]`)
  )
  assertFoldersInput(value.folders)
  assertBoundedSerializedSize(value, MAX_INDEX_BYTES, 'index')
}

export function assertSessionLoadOptions(
  value: unknown
): asserts value is { limit?: number } | undefined {
  if (value === undefined) return
  assertRecord(value, 'options')
  if (value.limit !== undefined) {
    if (
      !Number.isInteger(value.limit) ||
      (value.limit as number) < 1 ||
      (value.limit as number) > MAX_PAGE_LIMIT
    ) {
      throw new Error(`options.limit must be an integer between 1 and ${MAX_PAGE_LIMIT}`)
    }
  }
}

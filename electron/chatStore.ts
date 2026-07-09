/**
 * Main-process chat persistence backed by metadata + per-session JSON files.
 *
 * `chat-index.json` keeps lightweight session metadata and folders in memory.
 * Full message arrays live in `chat-sessions/{sessionId}.json` and are loaded
 * on demand so long histories do not stay resident in the main process.
 */

import { app } from 'electron'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as path from 'path'
import { writeFileAtomic } from './utils/atomicFile'

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  image?: string
  files?: unknown[]
  timestamp: number
  tokenCount?: number
  agentRun?: unknown
  toolResults?: unknown[]
  thinkingBlocks?: unknown[]
  researchStatus?: unknown
  model?: string
  latency?: number
  usage?: unknown
}

export interface ChatSession {
  id: string
  title: string
  messages: Message[]
  artifacts?: ArtifactDocument[]
  /** Carried on lightweight sessions so index re-saves don't drop old artifact history */
  artifactSummaries?: ArtifactSummary[]
  createdAt: number
  updatedAt: number
  totalTokens?: number
  // Optional session organization metadata.
  pinned?: boolean // default: false
  folderId?: string | null // default: null
  tags?: string[] // default: []
  messageCount?: number
}

export type ArtifactKind = 'text' | 'markdown' | 'code' | 'html' | 'json' | 'svg' | 'mermaid'

export interface ArtifactVersion {
  id: string
  content: string
  createdAt: number
  sourceMessageId?: string
  changeSummary?: string
}

export interface ArtifactDocument {
  id: string
  title: string
  kind: ArtifactKind
  language?: string
  createdAt: number
  updatedAt: number
  createdByMessageId?: string
  updatedByMessageId?: string
  currentVersionId: string
  versions: ArtifactVersion[]
}

export interface ArtifactSummary {
  id: string
  title: string
  kind: ArtifactKind
  language?: string
  updatedAt: number
  currentVersionId: string
  versionCount: number
}

export interface ChatSessionMetadata {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  totalTokens?: number
  pinned: boolean
  folderId: string | null
  tags: string[]
  messageCount: number
  artifactCount?: number
  artifactSummaries?: ArtifactSummary[]
  /** Last ~30 messages for instant preview when switching chats (kept small for perf) */
  recentMessages?: Message[]
}

/**
 * Folder definition for organizing chat sessions.
 */
export interface Folder {
  id: string
  name: string
  order: number // for display ordering
  createdAt: number
}

export interface ChatHistoryData {
  sessions: ChatSession[]
  folders: Folder[]
  version: number
}

export interface ChatIndexData {
  sessions: ChatSessionMetadata[]
  folders: Folder[]
  version: number
}

type LegacyChatHistoryData = Omit<ChatHistoryData, 'folders'> & {
  folders?: Folder[]
}

const INDEX_VERSION = 4

let cachedIndex: ChatIndexData | null = null
let indexCacheTimestamp = 0
const CACHE_TTL = 1000

let writeVersion = 0
let pendingWrite: Promise<void> = Promise.resolve()

function getUserDataPath(): string {
  return app.getPath('userData')
}

function getLegacyStorePath(): string {
  return path.join(getUserDataPath(), 'chat-history.json')
}

function getIndexPath(): string {
  return path.join(getUserDataPath(), 'chat-index.json')
}

function getSessionsDir(): string {
  return path.join(getUserDataPath(), 'chat-sessions')
}

function getSessionPath(id: string): string {
  return path.join(getSessionsDir(), `${encodeURIComponent(id)}.json`)
}

function createEmptyIndex(): ChatIndexData {
  return { sessions: [], folders: [], version: INDEX_VERSION }
}

function normalizeFolders(folders: unknown): Folder[] {
  return Array.isArray(folders) ? (folders.filter(Boolean) as Folder[]) : []
}

function isArtifactKind(value: unknown): value is ArtifactKind {
  return (
    value === 'text' ||
    value === 'markdown' ||
    value === 'code' ||
    value === 'html' ||
    value === 'json' ||
    value === 'svg' ||
    value === 'mermaid'
  )
}

function normalizeArtifacts(raw: unknown): ArtifactDocument[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry): ArtifactDocument | null => {
      if (!entry || typeof entry !== 'object') return null
      const artifact = entry as Partial<ArtifactDocument>
      if (
        !artifact.id ||
        !artifact.title ||
        !isArtifactKind(artifact.kind) ||
        !Array.isArray(artifact.versions)
      )
        return null
      const versions = artifact.versions.filter((version): version is ArtifactVersion =>
        Boolean(
          version &&
          typeof version.id === 'string' &&
          typeof version.content === 'string' &&
          typeof version.createdAt === 'number'
        )
      )
      if (versions.length === 0) return null
      const currentVersionId = versions.some((version) => version.id === artifact.currentVersionId)
        ? artifact.currentVersionId!
        : versions[versions.length - 1].id
      return {
        id: artifact.id,
        title: artifact.title.trim() || 'Untitled artifact',
        kind: artifact.kind,
        language:
          typeof artifact.language === 'string' && artifact.language.trim()
            ? artifact.language.trim()
            : undefined,
        createdAt:
          typeof artifact.createdAt === 'number' ? artifact.createdAt : versions[0].createdAt,
        updatedAt:
          typeof artifact.updatedAt === 'number'
            ? artifact.updatedAt
            : versions[versions.length - 1].createdAt,
        createdByMessageId:
          typeof artifact.createdByMessageId === 'string' ? artifact.createdByMessageId : undefined,
        updatedByMessageId:
          typeof artifact.updatedByMessageId === 'string' ? artifact.updatedByMessageId : undefined,
        currentVersionId,
        versions,
      }
    })
    .filter((artifact): artifact is ArtifactDocument => Boolean(artifact))
}

function summarizeArtifacts(
  artifacts: ArtifactDocument[] | undefined
): ArtifactSummary[] | undefined {
  if (!artifacts || artifacts.length === 0) return undefined
  return artifacts.map((artifact) => ({
    id: artifact.id,
    title: artifact.title,
    kind: artifact.kind,
    language: artifact.language,
    updatedAt: artifact.updatedAt,
    currentVersionId: artifact.currentVersionId,
    versionCount: artifact.versions.length,
  }))
}

/**
 * Normalizes optional session metadata and removes deprecated fields.
 */
export function migrateSession(session: ChatSession): ChatSession {
  const rest = { ...(session as ChatSession & { archived?: boolean }) }
  delete rest.archived
  const messages = Array.isArray(session.messages) ? session.messages : []
  return {
    ...rest,
    messages,
    artifacts: normalizeArtifacts(session.artifacts),
    artifactSummaries: session.artifactSummaries,
    pinned: session.pinned ?? false,
    folderId: session.folderId ?? null,
    tags: Array.isArray(session.tags) ? session.tags : [],
    messageCount: session.messageCount ?? messages.length,
  }
}

/** Messages kept on the chat index for instant preview. Kept small for RAM. */
export const RECENT_TAIL_SIZE = 20
/** Default window size when opening a session (full history loaded on demand). */
export const SESSION_WINDOW_SIZE = 80
const INDEX_CONTENT_PREVIEW_CHARS = 280

/**
 * Strip multi-MB fields before embedding messages in the chat index / renderer previews.
 * Full payloads remain in per-session JSON files.
 */
export function toIndexPreviewMessage(message: Message): Message {
  const content =
    typeof message.content === 'string' && message.content.length > INDEX_CONTENT_PREVIEW_CHARS
      ? message.content.slice(0, INDEX_CONTENT_PREVIEW_CHARS)
      : message.content

  const preview: Message = {
    id: message.id,
    role: message.role,
    content,
    timestamp: message.timestamp,
  }

  if (message.model) preview.model = message.model
  if (typeof message.tokenCount === 'number') preview.tokenCount = message.tokenCount
  if (typeof message.latency === 'number') preview.latency = message.latency
  if (message.usage) preview.usage = message.usage
  // Preserve presence flags without base64 / tool payloads.
  if (message.image) preview.image = ''
  if (Array.isArray(message.files) && message.files.length > 0) {
    preview.files = message.files.map((file) => {
      if (!file || typeof file !== 'object') return file
      const entry = file as { id?: string; name?: string; type?: string; size?: number; mimeType?: string }
      return {
        id: entry.id,
        name: entry.name,
        type: entry.type,
        size: entry.size,
        mimeType: entry.mimeType,
        data: '',
      }
    })
  }
  if (Array.isArray(message.toolResults) && message.toolResults.length > 0) {
    preview.toolResults = message.toolResults.map((result) => {
      if (!result || typeof result !== 'object') return result
      const entry = result as {
        toolCall?: { id?: string; name?: string; arguments?: unknown }
        result?: { success?: boolean; error?: string; executionTime?: number }
      }
      return {
        toolCall: {
          id: entry.toolCall?.id ?? '',
          name: entry.toolCall?.name ?? 'tool',
          arguments: entry.toolCall?.arguments,
        },
        result: {
          success: entry.result?.success ?? false,
          error: entry.result?.error,
          executionTime: entry.result?.executionTime,
        },
      }
    })
  }

  return preview
}

export function buildRecentMessagesTail(messages: Message[]): Message[] | undefined {
  if (!Array.isArray(messages) || messages.length === 0) return undefined
  return messages.slice(-RECENT_TAIL_SIZE).map(toIndexPreviewMessage)
}

/**
 * Slim message fields for Usage stats (no images/content bodies/tool data).
 */
export function toUsageMetricMessage(message: Message): Message {
  const content =
    typeof message.content === 'string' ? message.content.slice(0, 240) : message.content
  const slim: Message = {
    id: message.id,
    role: message.role,
    content,
    timestamp: message.timestamp,
  }
  if (message.model) slim.model = message.model
  if (typeof message.tokenCount === 'number') slim.tokenCount = message.tokenCount
  if (typeof message.latency === 'number') slim.latency = message.latency
  if (message.usage) slim.usage = message.usage
  if (message.image) slim.image = '1'
  if (Array.isArray(message.toolResults) && message.toolResults.length > 0) {
    slim.toolResults = message.toolResults.map((result) => {
      if (!result || typeof result !== 'object') return result
      const entry = result as {
        toolCall?: { id?: string; name?: string; arguments?: unknown }
        result?: { success?: boolean; error?: string; executionTime?: number }
      }
      return {
        toolCall: {
          id: entry.toolCall?.id ?? '',
          name: entry.toolCall?.name ?? 'tool',
          arguments: entry.toolCall?.arguments,
        },
        result: {
          success: entry.result?.success ?? false,
          error: entry.result?.error,
          executionTime: entry.result?.executionTime,
        },
      }
    })
  }
  return slim
}

export function sessionToMetadata(session: ChatSession): ChatSessionMetadata {
  const migrated = migrateSession(session)
  const messages = migrated.messages ?? []
  const messageCount = migrated.messageCount ?? messages.length
  const recentMessages = buildRecentMessagesTail(messages)

  return {
    id: migrated.id,
    title: migrated.title,
    createdAt: migrated.createdAt,
    updatedAt: migrated.updatedAt,
    totalTokens: migrated.totalTokens,
    pinned: migrated.pinned ?? false,
    folderId: migrated.folderId ?? null,
    tags: Array.isArray(migrated.tags) ? migrated.tags : [],
    messageCount,
    artifactCount: migrated.artifacts?.length ?? migrated.artifactSummaries?.length ?? 0,
    artifactSummaries: migrated.artifacts?.length
      ? summarizeArtifacts(migrated.artifacts)
      : (migrated.artifactSummaries ?? undefined),
    recentMessages,
  }
}

function metadataToSession(metadata: ChatSessionMetadata, messages: Message[] = []): ChatSession {
  // Prefer provided messages; otherwise fall back to embedded recent tail for preview
  const effectiveMessages = messages.length > 0 ? messages : (metadata.recentMessages ?? [])
  return {
    id: metadata.id,
    title: metadata.title,
    messages: effectiveMessages,
    createdAt: metadata.createdAt,
    updatedAt: metadata.updatedAt,
    totalTokens: metadata.totalTokens,
    pinned: metadata.pinned,
    folderId: metadata.folderId,
    tags: [...metadata.tags],
    messageCount: metadata.messageCount,
    artifacts: [],
    artifactSummaries: metadata.artifactSummaries,
  }
}

function mergeMetadataWithSession(
  existing: ChatSessionMetadata | undefined,
  session: ChatSession
): ChatSessionMetadata {
  // Always rebuild thin recentMessages so index saves do not retain fat tails.
  const base = sessionToMetadata(session)
  const migratedArtifacts = normalizeArtifacts(session.artifacts)
  const artifactSummaries =
    migratedArtifacts.length > 0
      ? base.artifactSummaries
      : Array.isArray(session.artifactSummaries)
        ? session.artifactSummaries
        : existing?.artifactSummaries
  return {
    ...base,
    pinned: base.pinned ?? existing?.pinned ?? false,
    folderId: base.folderId ?? existing?.folderId ?? null,
    tags: base.tags.length > 0 ? base.tags : (existing?.tags ?? []),
    artifactCount:
      migratedArtifacts.length > 0
        ? migratedArtifacts.length
        : (artifactSummaries?.length ?? existing?.artifactCount ?? 0),
    artifactSummaries,
  }
}

function normalizeMetadata(input: unknown): ChatSessionMetadata | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Partial<ChatSessionMetadata> & { messages?: Message[] }
  if (
    !raw.id ||
    !raw.title ||
    typeof raw.createdAt !== 'number' ||
    typeof raw.updatedAt !== 'number'
  ) {
    return null
  }
  const messageCount =
    typeof raw.messageCount === 'number'
      ? raw.messageCount
      : Array.isArray(raw.messages)
        ? raw.messages.length
        : 0
  return {
    id: raw.id,
    title: raw.title,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    totalTokens: raw.totalTokens,
    pinned: raw.pinned ?? false,
    folderId: raw.folderId ?? null,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    messageCount,
    artifactCount: typeof raw.artifactCount === 'number' ? raw.artifactCount : 0,
    artifactSummaries: Array.isArray(raw.artifactSummaries)
      ? (raw.artifactSummaries.filter(Boolean) as ArtifactSummary[])
      : undefined,
    recentMessages: Array.isArray(raw.recentMessages) ? raw.recentMessages : undefined,
  }
}

/**
 * Migrates older persisted payloads to the current on-disk shape.
 */
export function migrateData(data: ChatHistoryData): ChatHistoryData {
  if (data.version < 2) {
    const legacyData = data as LegacyChatHistoryData
    return {
      sessions: data.sessions.map(migrateSession),
      folders: legacyData.folders ?? [],
      version: 2,
    }
  }
  if (!data.folders) {
    data.folders = []
  }
  return {
    sessions: data.sessions.map(migrateSession),
    folders: data.folders,
    version: data.version,
  }
}

function normalizeIndex(data: unknown): ChatIndexData {
  if (!data || typeof data !== 'object') return createEmptyIndex()
  const raw = data as Partial<ChatIndexData>
  return {
    sessions: Array.isArray(raw.sessions)
      ? raw.sessions
          .map(normalizeMetadata)
          .filter((session): session is ChatSessionMetadata => Boolean(session))
      : [],
    folders: normalizeFolders(raw.folders),
    version: INDEX_VERSION,
  }
}

async function ensureSessionsDir(): Promise<void> {
  await fs.mkdir(getSessionsDir(), { recursive: true })
}

function ensureSessionsDirSync(): void {
  fsSync.mkdirSync(getSessionsDir(), { recursive: true })
}

async function writeIndexAsync(index: ChatIndexData): Promise<void> {
  const myVersion = ++writeVersion
  const normalized = normalizeIndex(index)

  const doWrite = async () => {
    await writeFileAtomic(getIndexPath(), JSON.stringify(normalized, null, 2))
    if (myVersion === writeVersion) {
      cachedIndex = normalized
      indexCacheTimestamp = Date.now()
    }
  }

  pendingWrite = pendingWrite.then(doWrite)
  await pendingWrite
}

async function writeSessionFileAsync(session: ChatSession): Promise<void> {
  await ensureSessionsDir()
  const migrated = migrateSession(session)
  await writeFileAtomic(getSessionPath(migrated.id), JSON.stringify(migrated, null, 2))
}

function writeSessionFileSync(session: ChatSession): void {
  ensureSessionsDirSync()
  const migrated = migrateSession(session)
  fsSync.writeFileSync(getSessionPath(migrated.id), JSON.stringify(migrated, null, 2))
}

async function migrateLegacyStoreIfNeeded(): Promise<ChatIndexData | null> {
  if (fsSync.existsSync(getIndexPath())) {
    return null
  }

  const legacyPath = getLegacyStorePath()
  if (!fsSync.existsSync(legacyPath)) {
    return null
  }

  const raw = await fs.readFile(legacyPath, 'utf-8')
  const migrated = migrateData(JSON.parse(raw))
  await ensureSessionsDir()
  for (const session of migrated.sessions) {
    await writeSessionFileAsync(session)
  }

  const index: ChatIndexData = {
    sessions: migrated.sessions.map(sessionToMetadata),
    folders: migrated.folders,
    version: INDEX_VERSION,
  }
  await writeIndexAsync(index)
  return index
}

function migrateLegacyStoreIfNeededSync(): ChatIndexData | null {
  if (fsSync.existsSync(getIndexPath())) {
    return null
  }

  const legacyPath = getLegacyStorePath()
  if (!fsSync.existsSync(legacyPath)) {
    return null
  }

  const raw = fsSync.readFileSync(legacyPath, 'utf-8')
  const migrated = migrateData(JSON.parse(raw))
  ensureSessionsDirSync()
  for (const session of migrated.sessions) {
    writeSessionFileSync(session)
  }

  const index: ChatIndexData = {
    sessions: migrated.sessions.map(sessionToMetadata),
    folders: migrated.folders,
    version: INDEX_VERSION,
  }
  fsSync.writeFileSync(getIndexPath(), JSON.stringify(index, null, 2))
  cachedIndex = index
  indexCacheTimestamp = Date.now()
  return index
}

async function readIndexAsync(): Promise<ChatIndexData> {
  if (cachedIndex && Date.now() - indexCacheTimestamp < CACHE_TTL) {
    return cachedIndex
  }

  try {
    const migrated = await migrateLegacyStoreIfNeeded()
    if (migrated) return migrated

    if (fsSync.existsSync(getIndexPath())) {
      const data = await fs.readFile(getIndexPath(), 'utf-8')
      const parsed = normalizeIndex(JSON.parse(data))
      cachedIndex = parsed
      indexCacheTimestamp = Date.now()
      return parsed
    }
  } catch (error) {
    console.error('Failed to read chat index:', error)
  }

  return createEmptyIndex()
}

function readIndex(): ChatIndexData {
  if (cachedIndex && Date.now() - indexCacheTimestamp < CACHE_TTL) {
    return cachedIndex
  }

  try {
    const migrated = migrateLegacyStoreIfNeededSync()
    if (migrated) return migrated

    if (fsSync.existsSync(getIndexPath())) {
      const data = fsSync.readFileSync(getIndexPath(), 'utf-8')
      const parsed = normalizeIndex(JSON.parse(data))
      cachedIndex = parsed
      indexCacheTimestamp = Date.now()
      return parsed
    }
  } catch (error) {
    console.error('Failed to read chat index:', error)
  }

  return createEmptyIndex()
}

async function readSessionFileAsync(id: string): Promise<ChatSession | null> {
  try {
    const data = await fs.readFile(getSessionPath(id), 'utf-8')
    return migrateSession(JSON.parse(data))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`Failed to read chat session ${id}:`, error)
    }
    return null
  }
}

function readSessionFile(id: string): ChatSession | null {
  try {
    const data = fsSync.readFileSync(getSessionPath(id), 'utf-8')
    return migrateSession(JSON.parse(data))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`Failed to read chat session ${id}:`, error)
    }
    return null
  }
}

async function replaceIndexSession(metadata: ChatSessionMetadata): Promise<void> {
  const index = await readIndexAsync()
  const nextSessions = index.sessions.filter((session) => session.id !== metadata.id)
  nextSessions.unshift(metadata)
  nextSessions.sort((a, b) => b.updatedAt - a.updatedAt)
  await writeIndexAsync({ ...index, sessions: nextSessions })
}

export function getSessionMetadata(): ChatSessionMetadata[] {
  return readIndex().sessions
}

export async function getSessionMetadataAsync(): Promise<ChatSessionMetadata[]> {
  const index = await readIndexAsync()
  return index.sessions
}

export function getChatIndex(): ChatIndexData {
  return readIndex()
}

export async function getChatIndexAsync(): Promise<ChatIndexData> {
  return readIndexAsync()
}

export async function saveChatIndexAsync(index: ChatIndexData): Promise<void> {
  await writeIndexAsync({ ...normalizeIndex(index), version: INDEX_VERSION })
}

export function getAllSessions(): ChatSession[] {
  const index = readIndex()
  return index.sessions.map(
    (metadata) => readSessionFile(metadata.id) ?? metadataToSession(metadata)
  )
}

export function saveAllSessions(sessions: ChatSession[]): void {
  const index = readIndex()
  const nextIndex: ChatIndexData = {
    sessions: sessions.map(sessionToMetadata),
    folders: index.folders,
    version: INDEX_VERSION,
  }

  ensureSessionsDirSync()
  for (const session of sessions) {
    writeSessionFileSync(session)
  }
  cachedIndex = nextIndex
  indexCacheTimestamp = Date.now()
  writeIndexAsync(nextIndex).catch((error) => console.error('Failed to write chat index:', error))
}

export function getAllFolders(): Folder[] {
  return readIndex().folders
}

export function saveFolders(folders: Folder[]): void {
  const index = readIndex()
  const nextIndex = { ...index, folders }
  cachedIndex = nextIndex
  indexCacheTimestamp = Date.now()
  writeIndexAsync(nextIndex).catch((error) => console.error('Failed to write folders:', error))
}

export function getSession(id: string): ChatSession | undefined {
  return readSessionFile(id) ?? undefined
}

export function createSession(session: ChatSession): void {
  saveSessionAsync(session).catch((error) => console.error('Failed to create chat session:', error))
}

export function updateSession(id: string, updates: Partial<ChatSession>): void {
  const existing = getSession(id)
  if (!existing) return
  saveSessionAsync({ ...existing, ...updates, id }).catch((error) =>
    console.error('Failed to update chat session:', error)
  )
}

export function addMessageToSession(sessionId: string, message: Message): void {
  const session = getSession(sessionId)
  if (!session) return

  session.messages.push(message)
  session.updatedAt = Date.now()
  if (message.tokenCount) {
    session.totalTokens = (session.totalTokens || 0) + message.tokenCount
  }

  saveSessionAsync(session).catch((error) => console.error('Failed to add chat message:', error))
}

export function deleteSession(id: string): void {
  deleteSessionAsync(id).catch((error) => console.error('Failed to delete chat session:', error))
}

export function clearAllSessions(): void {
  const index = readIndex()
  for (const session of index.sessions) {
    try {
      fsSync.rmSync(getSessionPath(session.id), { force: true })
    } catch {
      // Best-effort cleanup; the index is authoritative.
    }
  }
  saveAllSessions([])
}

export function migrateFromLocalStorage(localStorageData: ChatSession[]): void {
  if (localStorageData && localStorageData.length > 0) {
    const existingSessions = getSessionMetadata()
    if (existingSessions.length === 0) {
      saveAllSessions(localStorageData)
    }
  }
}

export function getStoreFilePath(): string {
  return getIndexPath()
}

export function getSessionStoreDirPath(): string {
  return getSessionsDir()
}

export async function getAllSessionsAsync(): Promise<ChatSession[]> {
  const index = await readIndexAsync()
  const sessions = await Promise.all(
    index.sessions.map(
      async (metadata) => (await readSessionFileAsync(metadata.id)) ?? metadataToSession(metadata)
    )
  )
  return sessions
}

export async function saveAllSessionsAsync(sessions: ChatSession[]): Promise<void> {
  await ensureSessionsDir()
  for (const session of sessions) {
    await writeSessionFileAsync(session)
  }
  const currentIndex = await readIndexAsync()
  await writeIndexAsync({
    sessions: sessions.map(sessionToMetadata),
    folders: currentIndex.folders,
    version: INDEX_VERSION,
  })
}

export async function getSessionAsync(
  id: string,
  options?: { limit?: number }
): Promise<ChatSession | null> {
  const session = await readSessionFileAsync(id)
  if (!session || !options?.limit || !Array.isArray(session.messages)) {
    return session
  }
  // Return only the most recent messages for fast initial load
  const limit = Math.max(1, options.limit)
  session.messages = session.messages.slice(-limit)
  return session
}

/**
 * Load all sessions for Usage metrics with multi-MB fields stripped.
 * Prefer this over getAllSessionsAsync in the renderer.
 */
export async function getUsageSessionsAsync(): Promise<ChatSession[]> {
  const sessions = await getAllSessionsAsync()
  return sessions.map((session) => ({
    ...session,
    messages: Array.isArray(session.messages)
      ? session.messages.map(toUsageMetricMessage)
      : [],
    // Usage metrics do not need artifact version bodies.
    artifacts: undefined,
  }))
}

export async function saveSessionAsync(session: ChatSession): Promise<ChatSessionMetadata> {
  const index = await readIndexAsync()
  const existing = index.sessions.find((entry) => entry.id === session.id)
  const metadata = mergeMetadataWithSession(existing, session)
  await writeSessionFileAsync({ ...session, ...metadata })
  await replaceIndexSession(metadata)
  return metadata
}

export async function deleteSessionAsync(id: string): Promise<boolean> {
  const index = await readIndexAsync()
  const nextSessions = index.sessions.filter((session) => session.id !== id)
  const existed = nextSessions.length !== index.sessions.length
  if (!existed) return false

  await fs.rm(getSessionPath(id), { force: true })
  await writeIndexAsync({ ...index, sessions: nextSessions })
  return true
}

export async function saveSessionMetadataAsync(metadata: ChatSessionMetadata): Promise<void> {
  const index = await readIndexAsync()
  const nextSessions = index.sessions.map((session) =>
    session.id === metadata.id ? { ...metadata, tags: [...metadata.tags] } : session
  )
  if (!nextSessions.some((session) => session.id === metadata.id)) {
    nextSessions.unshift({ ...metadata, tags: [...metadata.tags] })
  }
  await writeIndexAsync({
    ...index,
    sessions: nextSessions.sort((a, b) => b.updatedAt - a.updatedAt),
  })
}

export async function saveSessionMetadataListAsync(metadata: ChatSessionMetadata[]): Promise<void> {
  const index = await readIndexAsync()
  await writeIndexAsync({
    ...index,
    sessions: metadata.map((session) => ({ ...session, tags: [...session.tags] })),
  })
}

export async function getAllFoldersAsync(): Promise<Folder[]> {
  const index = await readIndexAsync()
  return index.folders
}

export async function saveFoldersAsync(folders: Folder[]): Promise<void> {
  const index = await readIndexAsync()
  await writeIndexAsync({ ...index, folders })
}

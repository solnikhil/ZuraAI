import type {
  ChatSession,
  ChatSessionMetadata,
  CompactPreviewMessage,
  Folder,
  Message,
} from '../chat/types'
import { normalizeArtifacts, summarizeArtifact } from '../artifacts/artifactStore'

const INDEX_RECENT_TAIL_SIZE = 20
const INDEX_PREVIEW_CONTENT_MAX = 500

export function compactMessageForIndex(message: Message): CompactPreviewMessage {
  return {
    id: message.id,
    role: message.role,
    content:
      typeof message.content === 'string'
        ? message.content.slice(0, INDEX_PREVIEW_CONTENT_MAX)
        : '',
    timestamp: message.timestamp,
    model: message.model,
    hasImage: Boolean(message.image) || undefined,
    hasFiles: Array.isArray(message.files) && message.files.length > 0 ? true : undefined,
    toolResultCount:
      Array.isArray(message.toolResults) && message.toolResults.length > 0
        ? message.toolResults.length
        : undefined,
    hasThinking:
      message.thinking ||
      (Array.isArray(message.thinkingBlocks) && message.thinkingBlocks.length > 0)
        ? true
        : undefined,
  }
}

export function metadataToSession(
  metadata: ChatSessionMetadata,
  messages: Message[] = []
): ChatSession {
  const effectiveMessages =
    messages.length > 0
      ? messages
      : (metadata.recentMessages ?? []).map((preview) => ({
          id: preview.id,
          role: preview.role,
          content: preview.content,
          timestamp: preview.timestamp,
          model: preview.model,
        }))
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

export function normalizeSession(session: ChatSession): ChatSession {
  const messages = Array.isArray(session.messages) ? session.messages : []
  return {
    ...session,
    messages,
    artifacts: normalizeArtifacts(session.artifacts),
    artifactSummaries: session.artifactSummaries,
    pinned: session.pinned ?? false,
    folderId: session.folderId ?? null,
    tags: Array.isArray(session.tags) ? session.tags : [],
    messageCount: session.messageCount ?? messages.length,
  }
}

export function sessionToMetadata(session: ChatSession): ChatSessionMetadata {
  const messages = session.messages ?? []
  const recentMessages =
    messages.length > 0
      ? messages.slice(-INDEX_RECENT_TAIL_SIZE).map(compactMessageForIndex)
      : undefined
  return {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    totalTokens: session.totalTokens,
    pinned: session.pinned ?? false,
    folderId: session.folderId ?? null,
    tags: Array.isArray(session.tags) ? session.tags : [],
    messageCount: session.messages?.length ?? session.messageCount ?? 0,
    artifactCount: session.artifacts?.length ?? session.artifactSummaries?.length ?? 0,
    artifactSummaries: session.artifacts?.length
      ? session.artifacts.map(summarizeArtifact)
      : (session.artifactSummaries ?? undefined),
    recentMessages,
  }
}

export function setSessionPinned(session: ChatSession, pinned: boolean, now: number): ChatSession {
  return { ...session, pinned, updatedAt: now }
}

export function setSessionFolder(
  session: ChatSession,
  folderId: string | null,
  now: number
): ChatSession {
  return { ...session, folderId, updatedAt: now }
}

export function addSessionTag(session: ChatSession, tag: string, now: number): ChatSession {
  const tags = session.tags ?? []
  return tags.includes(tag) ? session : { ...session, tags: [...tags, tag], updatedAt: now }
}

export function removeSessionTag(session: ChatSession, tag: string, now: number): ChatSession {
  return { ...session, tags: (session.tags ?? []).filter((entry) => entry !== tag), updatedAt: now }
}

export function deleteFolderFromState(
  folders: Folder[],
  sessions: ChatSession[],
  id: string,
  now: number
) {
  return {
    folders: folders.filter((folder) => folder.id !== id),
    sessions: sessions.map((session) =>
      session.folderId === id ? setSessionFolder(session, null, now) : session
    ),
  }
}

import type { ChatSession, Message } from '../../../../contexts/ChatHistoryContext'

/**
 * Creates a duplicate of a ChatSession with a new unique ID, a title
 * prefixed with "Copy of ", and fresh timestamps. Each message in the
 * duplicate also receives a new unique ID.
 *
 * The duplicate is always created as unpinned and unarchived, but
 * preserves the original session's folderId, tags, and totalTokens.
 *
 * Requirements: 7.8
 */
export function duplicateSession(session: ChatSession): ChatSession {
  const now = Date.now()

  // Deep-copy messages with new unique IDs
  const duplicatedMessages: Message[] = session.messages.map(msg => ({
    ...msg,
    id: crypto.randomUUID(),
  }))

  return {
    id: crypto.randomUUID(),
    title: `Copy of ${session.title}`,
    messages: duplicatedMessages,
    createdAt: now,
    updatedAt: now,
    totalTokens: session.totalTokens,
    pinned: false,
    archived: false,
    folderId: session.folderId,
    tags: session.tags ? [...session.tags] : [],
  }
}

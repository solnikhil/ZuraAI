import type { ChatIndexData, ChatSession, ChatSessionMetadata, Folder } from '../chat/types'
import { metadataToSession, normalizeSession } from './chatHistoryDomain'

const LOCAL_CHAT_HISTORY_KEY = 'zura-chat-history'
const LOCAL_CHAT_INDEX_KEY = 'zura-chat-index'

export const isElectronChatRepository = () =>
  typeof window !== 'undefined' && Boolean(window.ipcRenderer)

export const chatHistoryRepository = {
  getMetadata: () =>
    window.ipcRenderer.invoke('chat-store:get-metadata') as Promise<ChatSessionMetadata[]>,
  getFolders: () => window.ipcRenderer.invoke('chat-store:get-all-folders') as Promise<Folder[]>,
  getSession: (id: string, options?: { limit?: number }) =>
    window.ipcRenderer.invoke('chat-store:get-session', id, options) as Promise<ChatSession | null>,
  saveSession: (session: ChatSession) =>
    window.ipcRenderer.invoke('chat-store:save-session', session) as Promise<boolean>,
  deleteSession: (id: string) =>
    window.ipcRenderer.invoke('chat-store:delete-session', id) as Promise<boolean>,
  saveIndex: (index: ChatIndexData) =>
    window.ipcRenderer.invoke('chat-store:save-index', index) as Promise<boolean>,
  migrate: (sessions: ChatSession[]) =>
    window.ipcRenderer.invoke('chat-store:migrate', sessions) as Promise<boolean>,
}

export function readLocalChatIndex(): { sessions: ChatSession[]; folders: Folder[] } {
  const savedIndex = localStorage.getItem(LOCAL_CHAT_INDEX_KEY)
  if (savedIndex) {
    try {
      const parsed = JSON.parse(savedIndex) as Partial<ChatIndexData>
      return {
        sessions: (Array.isArray(parsed.sessions) ? parsed.sessions : []).map((entry) =>
          metadataToSession(entry)
        ),
        folders: Array.isArray(parsed.folders) ? parsed.folders : [],
      }
    } catch (error) {
      console.error('Failed to parse local chat index:', error)
    }
  }
  const savedHistory = localStorage.getItem(LOCAL_CHAT_HISTORY_KEY)
  const parsedHistory = savedHistory ? (JSON.parse(savedHistory) as ChatSession[]) : []
  return { sessions: parsedHistory.map(normalizeSession), folders: [] }
}

export const localChatStorage = {
  historyKey: LOCAL_CHAT_HISTORY_KEY,
  indexKey: LOCAL_CHAT_INDEX_KEY,
  save(index: ChatIndexData, sessions: ChatSession[]) {
    localStorage.setItem(LOCAL_CHAT_INDEX_KEY, JSON.stringify(index))
    localStorage.setItem(LOCAL_CHAT_HISTORY_KEY, JSON.stringify(sessions))
  },
  readSessions(): ChatSession[] {
    const saved = localStorage.getItem(LOCAL_CHAT_HISTORY_KEY)
    return saved ? (JSON.parse(saved) as ChatSession[]) : []
  },
}

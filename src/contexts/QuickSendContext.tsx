import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export interface QuickSendRequest {
  content: string
  sessionId?: string
}

interface QuickSendContextValue {
  /** Message waiting to be sent, or null */
  pendingMessage: string | null
  /** Full pending send request, including optional target session */
  pendingRequest: QuickSendRequest | null
  /** Queue a message to be sent by ChatArea once it mounts / is ready */
  queueMessage: (content: string) => void
  /** Queue a message for one specific chat session */
  queueMessageForSession: (sessionId: string, content: string) => void
  /** Consume (clear) the pending message; returns the message or null */
  consumeMessage: () => string | null
  /** Consume (clear) the full pending request */
  consumeRequest: () => QuickSendRequest | null
}

const QuickSendContext = createContext<QuickSendContextValue | null>(null)

export function QuickSendProvider({ children }: { children: ReactNode }) {
  const [pendingRequest, setPendingRequest] = useState<QuickSendRequest | null>(null)
  const pendingRef = useRef<QuickSendRequest | null>(null)
  const pendingMessage = pendingRequest?.content ?? null

  const queueRequest = useCallback((request: QuickSendRequest) => {
    const trimmed = request.content.trim()
    if (!trimmed) return
    const normalized: QuickSendRequest = {
      content: trimmed,
      sessionId: request.sessionId?.trim() || undefined,
    }
    pendingRef.current = normalized
    setPendingRequest(normalized)
  }, [])

  const queueMessage = useCallback(
    (content: string) => {
      queueRequest({ content })
    },
    [queueRequest]
  )

  const queueMessageForSession = useCallback(
    (sessionId: string, content: string) => {
      queueRequest({ content, sessionId })
    },
    [queueRequest]
  )

  const consumeRequest = useCallback((): QuickSendRequest | null => {
    const request = pendingRef.current
    pendingRef.current = null
    setPendingRequest(null)
    return request
  }, [])

  const consumeMessage = useCallback((): string | null => {
    return consumeRequest()?.content ?? null
  }, [consumeRequest])

  const contextValue = useMemo(
    () => ({
      pendingMessage,
      pendingRequest,
      queueMessage,
      queueMessageForSession,
      consumeMessage,
      consumeRequest,
    }),
    [
      pendingMessage,
      pendingRequest,
      queueMessage,
      queueMessageForSession,
      consumeMessage,
      consumeRequest,
    ]
  )

  return <QuickSendContext.Provider value={contextValue}>{children}</QuickSendContext.Provider>
}

export function useQuickSend(): QuickSendContextValue {
  const ctx = useContext(QuickSendContext)
  if (!ctx) {
    throw new Error('useQuickSend must be used within a QuickSendProvider')
  }
  return ctx
}

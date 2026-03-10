import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

interface QuickSendContextValue {
  /** Message waiting to be sent, or null */
  pendingMessage: string | null
  /** Queue a message to be sent by ChatArea once it mounts / is ready */
  queueMessage: (content: string) => void
  /** Consume (clear) the pending message — returns the message or null */
  consumeMessage: () => string | null
}

const QuickSendContext = createContext<QuickSendContextValue | null>(null)

export function QuickSendProvider({ children }: { children: ReactNode }) {
  const [pendingMessage, setPendingMessage] = useState<string | null>(null)
  // Keep a ref in sync so consumeMessage always reads latest without stale closures
  const pendingRef = useRef<string | null>(null)

  const queueMessage = useCallback((content: string) => {
    const trimmed = content.trim()
    if (!trimmed) return
    pendingRef.current = trimmed
    setPendingMessage(trimmed)
  }, [])

  const consumeMessage = useCallback((): string | null => {
    const msg = pendingRef.current
    pendingRef.current = null
    setPendingMessage(null)
    return msg
  }, [])

  return (
    <QuickSendContext.Provider value={{ pendingMessage, queueMessage, consumeMessage }}>
      {children}
    </QuickSendContext.Provider>
  )
}

export function useQuickSend(): QuickSendContextValue {
  const ctx = useContext(QuickSendContext)
  if (!ctx) {
    throw new Error('useQuickSend must be used within a QuickSendProvider')
  }
  return ctx
}

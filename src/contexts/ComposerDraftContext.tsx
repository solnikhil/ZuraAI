import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export type IncomingFilesHandler = (files: File[]) => void

interface ComposerDraftContextValue {
  /** Current draft text in the composer */
  draftText: string
  /** Set the draft text in the composer */
  setDraftText: (text: string) => void
  /** Clear the draft text */
  clearDraft: () => void
  /**
   * Deliver external files (e.g. window-level drop) to the active chat composer.
   * Queues files when no handler is registered yet (e.g. chat view not mounted).
   */
  deliverIncomingFiles: (files: File[]) => void
  /** ChatArea registers to receive delivered files. Returns unsubscribe. */
  registerIncomingFilesHandler: (handler: IncomingFilesHandler) => () => void
}

const ComposerDraftContext = createContext<ComposerDraftContextValue | null>(null)

export function ComposerDraftProvider({ children }: { children: ReactNode }) {
  const [draftText, setDraftTextState] = useState('')
  // Keep a ref in sync so consumers can read latest without stale closures
  const draftRef = useRef('')
  const incomingFilesHandlerRef = useRef<IncomingFilesHandler | null>(null)
  const pendingIncomingFilesRef = useRef<File[]>([])

  const setDraftText = useCallback((text: string) => {
    draftRef.current = text
    setDraftTextState(text)
  }, [])

  const clearDraft = useCallback(() => {
    draftRef.current = ''
    setDraftTextState('')
  }, [])

  const deliverIncomingFiles = useCallback((files: File[]) => {
    if (files.length === 0) return

    const handler = incomingFilesHandlerRef.current
    if (handler) {
      handler(files)
      return
    }

    pendingIncomingFilesRef.current = [...pendingIncomingFilesRef.current, ...files]
  }, [])

  const registerIncomingFilesHandler = useCallback((handler: IncomingFilesHandler) => {
    incomingFilesHandlerRef.current = handler

    if (pendingIncomingFilesRef.current.length > 0) {
      const pending = pendingIncomingFilesRef.current
      pendingIncomingFilesRef.current = []
      handler(pending)
    }

    return () => {
      if (incomingFilesHandlerRef.current === handler) {
        incomingFilesHandlerRef.current = null
      }
    }
  }, [])

  const contextValue = useMemo(
    () => ({
      draftText,
      setDraftText,
      clearDraft,
      deliverIncomingFiles,
      registerIncomingFilesHandler,
    }),
    [draftText, setDraftText, clearDraft, deliverIncomingFiles, registerIncomingFilesHandler]
  )

  return (
    <ComposerDraftContext.Provider value={contextValue}>{children}</ComposerDraftContext.Provider>
  )
}

export function useComposerDraft(): ComposerDraftContextValue {
  const ctx = useContext(ComposerDraftContext)
  if (!ctx) {
    throw new Error('useComposerDraft must be used within a ComposerDraftProvider')
  }
  return ctx
}

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

interface ComposerDraftContextValue {
  /** Current draft text in the composer */
  draftText: string
  /** Set the draft text in the composer */
  setDraftText: (text: string) => void
  /** Clear the draft text */
  clearDraft: () => void
}

const ComposerDraftContext = createContext<ComposerDraftContextValue | null>(null)

export function ComposerDraftProvider({ children }: { children: ReactNode }) {
  const [draftText, setDraftTextState] = useState('')
  // Keep a ref in sync so consumers can read latest without stale closures
  const draftRef = useRef('')

  const setDraftText = useCallback((text: string) => {
    draftRef.current = text
    setDraftTextState(text)
  }, [])

  const clearDraft = useCallback(() => {
    draftRef.current = ''
    setDraftTextState('')
  }, [])

  const contextValue = useMemo(
    () => ({ draftText, setDraftText, clearDraft }),
    [draftText, setDraftText, clearDraft]
  )

  return (
    <ComposerDraftContext.Provider value={contextValue}>
      {children}
    </ComposerDraftContext.Provider>
  )
}

export function useComposerDraft(): ComposerDraftContextValue {
  const ctx = useContext(ComposerDraftContext)
  if (!ctx) {
    throw new Error('useComposerDraft must be used within a ComposerDraftProvider')
  }
  return ctx
}

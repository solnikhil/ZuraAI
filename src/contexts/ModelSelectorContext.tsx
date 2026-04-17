import { createContext, useCallback, useContext, useRef, type ReactNode } from 'react'

interface ModelSelectorContextValue {
  openSelector: () => void
  consumeRequest: () => boolean
}

const ModelSelectorContext = createContext<ModelSelectorContextValue>({
  openSelector: () => {},
  consumeRequest: () => false,
})

export function useModelSelectorContext() {
  return useContext(ModelSelectorContext)
}

export function ModelSelectorProvider({ children }: { children: ReactNode }) {
  const pendingRef = useRef(false)

  const openSelector = useCallback(() => {
    pendingRef.current = true
  }, [])

  const consumeRequest = useCallback(() => {
    if (pendingRef.current) {
      pendingRef.current = false
      return true
    }
    return false
  }, [])

  return (
    <ModelSelectorContext.Provider value={{ openSelector, consumeRequest }}>
      {children}
    </ModelSelectorContext.Provider>
  )
}
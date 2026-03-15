/**
 * Shared Toast component for ZuraAI
 * Provides toast notifications with different types (success, error, warning, info)
 * Now powered by shadcn's Sonner toaster
 *
 */

import React from 'react'
import { Toaster, toast } from 'sonner'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => void
}

export const ToastContext = React.createContext<ToastContextType | undefined>(undefined)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  // Memoize showToast callback to maintain stable reference
  const showToast = React.useCallback(
    (message: string, type: ToastType = 'info', duration: number = 4000) => {
      const options = { duration }

      switch (type) {
        case 'success':
          toast.success(message, options)
          break
        case 'error':
          toast.error(message, options)
          break
        case 'warning':
          toast.warning(message, options)
          break
        case 'info':
        default:
          toast.info(message, options)
          break
      }
    },
    []
  )

  // Memoize context value to prevent unnecessary child re-renders
  const contextValue = React.useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            color: 'hsl(var(--foreground))',
          },
        }}
        richColors
      />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = React.useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return context
}

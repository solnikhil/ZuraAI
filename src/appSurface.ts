export type AppSurface = 'about' | 'chat-debug' | 'dashboard'

/** Selects the top-level renderer surface without accepting route-prefix lookalikes. */
export function resolveAppSurface(hash: string, chatDebugAvailable: boolean): AppSurface {
  const path = hash.replace(/^#/, '').split('?', 1)[0]

  if (path === '/about') return 'about'
  if (path === '/chat-debug' && chatDebugAvailable) return 'chat-debug'
  return 'dashboard'
}

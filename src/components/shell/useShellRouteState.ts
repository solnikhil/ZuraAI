import { useMemo } from 'react'

export interface ShellRouteState {
  isDashboardRoute: boolean
  isSettingsRoute: boolean
  isLegacyChatRoute: boolean
  hasSidebar: boolean
}

function getShellRouteState(pathname: string): ShellRouteState {
  const isDashboardRoute = pathname === '/' || pathname === '/dashboard'
  const isSettingsRoute = pathname === '/settings'
  const isLegacyChatRoute = pathname === '/chat'

  return {
    isDashboardRoute,
    isSettingsRoute,
    isLegacyChatRoute,
    hasSidebar: isDashboardRoute || isLegacyChatRoute,
  }
}

export function useShellRouteState(pathname: string): ShellRouteState {
  return useMemo(() => getShellRouteState(pathname), [pathname])
}

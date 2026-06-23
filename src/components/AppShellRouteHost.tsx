import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AppShellProvider } from '../contexts/AppShellContext'
import { CommandPalette } from './CommandPalette'
import { ChatLinkRouteHost } from './ChatLinkRouteHost'

export default function AppShellRouteHost() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    console.info('[CommandPalette] route host mounted', {
      pathname: location.pathname,
      hash: window.location.hash,
    })
    return () => {
      console.info('[CommandPalette] route host unmounted', {
        pathname: location.pathname,
        hash: window.location.hash,
      })
    }
  }, [location.pathname])

  return (
    <AppShellProvider
      pathname={location.pathname}
      navigateToPath={(pathname) => navigate(pathname)}
    >
      <CommandPalette />
      <ChatLinkRouteHost />
      <Outlet />
    </AppShellProvider>
  )
}

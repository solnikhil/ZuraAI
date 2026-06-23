import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AppShellProvider } from '../contexts/AppShellContext'
import { CommandPalette } from './CommandPalette'
import { ChatLinkRouteHost } from './ChatLinkRouteHost'

export default function AppShellRouteHost() {
  const navigate = useNavigate()
  const location = useLocation()

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

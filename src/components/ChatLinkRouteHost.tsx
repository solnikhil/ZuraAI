import { useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAppShell } from '../contexts/AppShellContext'

export function ChatLinkRouteHost() {
  const navigate = useNavigate()
  const { setDashboardView } = useAppShell()

  const showChatSurface = useCallback(() => {
    if (
      !window.location.hash.startsWith('#/dashboard') &&
      !window.location.hash.startsWith('#/chat')
    ) {
      navigate('/dashboard')
    }
    setDashboardView('chat')
  }, [navigate, setDashboardView])

  useEffect(() => {
    if (!window.chatLinks) return

    let active = true
    window.chatLinks
      .peekPending()
      .then((requests) => {
        if (active && requests.length > 0) showChatSurface()
      })
      .catch(() => undefined)

    const unsubscribe = window.chatLinks.onMessage(() => {
      showChatSurface()
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [showChatSurface])

  return null
}

import { useEffect } from 'react'

import { useSettings } from '../contexts/SettingsContext'
import { useQuickSend } from '../contexts/QuickSendContext'
import { useChatHistory } from '../contexts/ChatHistoryContext'
import type { CommandCenterCommand } from '../electron/types'
import { isWindowsRuntime } from '../utils/platform'

function formatCommandCenterMessage(command: CommandCenterCommand): string {
  const text = command.text.trim()
  const activeWindow = command.activeWindow
  if (!activeWindow) return text

  const processName = activeWindow.processName?.trim()
  const title = activeWindow.title?.trim()
  const hwnd = typeof activeWindow.hwnd === 'number' ? String(activeWindow.hwnd) : ''
  const contextParts = [
    processName ? `app: ${processName}` : '',
    title ? `window: ${title}` : '',
    hwnd ? `hwnd: ${hwnd}` : '',
  ].filter(Boolean)

  if (contextParts.length === 0) return text
  return `Command Center desktop context (${contextParts.join(', ')}):\n${text}`
}

export default function CommandCenterSettingsSync() {
  const { settings, updateSettings } = useSettings()
  const { queueMessage } = useQuickSend()
  const { switchSession, loadFullSession } = useChatHistory()
  // The overlay is a keyboard launcher in both Chat and Agent modes. Freeform
  // requests switch to Agent Mode when submitted, but opening/searching fixed
  // commands must not depend on the current assistant mode.
  const enabled = isWindowsRuntime()

  useEffect(() => {
    void window.commandCenter?.setExtensionEnabled(enabled)
  }, [enabled])

  useEffect(() => {
    if (!window.commandCenter?.onCommand) return
    return window.commandCenter.onCommand((command) => {
      const text = formatCommandCenterMessage(command)
      if (command.sessionId) {
        switchSession(command.sessionId)
        void loadFullSession(command.sessionId)
        if (!text) return
      }
      if (settings.assistantMode !== 'agent') {
        updateSettings({ assistantMode: 'agent' })
      }
      queueMessage(text)
    })
  }, [loadFullSession, queueMessage, settings.assistantMode, switchSession, updateSettings])

  return null
}

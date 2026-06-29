import { useEffect } from 'react'

import { useSettings } from '../contexts/SettingsContext'
import { useQuickSend } from '../contexts/QuickSendContext'
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
  const enabled = isWindowsRuntime() && settings.assistantMode === 'agent'

  useEffect(() => {
    void window.commandCenter?.setExtensionEnabled(enabled)
  }, [enabled])

  useEffect(() => {
    if (!window.commandCenter?.onCommand) return
    return window.commandCenter.onCommand((command) => {
      const text = formatCommandCenterMessage(command)
      if (!text) return
      if (settings.assistantMode !== 'agent') {
        updateSettings({ assistantMode: 'agent' })
      }
      queueMessage(text)
    })
  }, [queueMessage, settings.assistantMode, updateSettings])

  return null
}

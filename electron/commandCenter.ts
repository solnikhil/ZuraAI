import { app as electronApp, clipboard, globalShortcut, ipcMain } from 'electron'
import os from 'os'
import path from 'path'

import { getSessionMetadataAsync } from './chatStore'
import {
  deleteCommandCenterWorkflow,
  listCommandCenterWorkflows,
  markCommandCenterWorkflowRun,
  saveCommandCenterWorkflow,
  type CommandCenterWorkflow,
} from './commandCenterWorkflows'
import {
  createMainWindow,
  getMainWindow,
  hideCommandCenterWindow,
  setCommandCenterWindowLayout,
  showCommandCenterWindow,
  toggleCommandCenterWindow,
} from './windows'
import {
  executeSystemActiveWindow,
  executeSystemMuteSet,
  executeSystemOpenPath,
  executeSystemSettingsOpen,
  executeSystemStatus,
  executeSystemThemeGet,
  executeSystemThemeSet,
  executeSystemVolumeGet,
  executeSystemVolumeSet,
  executeWindowSnap,
} from './tools/os-integration'
import { executeAppLaunch, executeAppList } from './tools/app-management'
import { executeWindowFocus, executeWindowList } from './tools/window-management'

const COMMAND_CENTER_SHORTCUT = 'CommandOrControl+Shift+Space'
const MAX_CLIPBOARD_CONTEXT_LENGTH = 4_000
const COMMAND_CENTER_ACTIONS = [
  { id: 'snap-left', label: 'Snap left', kind: 'window', aliases: ['tile left'] },
  { id: 'snap-right', label: 'Snap right', kind: 'window', aliases: ['tile right'] },
  { id: 'maximize-window', label: 'Maximize', kind: 'window', aliases: ['fullscreen', 'full screen'] },
  { id: 'volume-30', label: 'Volume 30%', kind: 'audio', aliases: ['quiet', 'lower volume'] },
  { id: 'volume-60', label: 'Volume 60%', kind: 'audio', aliases: ['medium volume'] },
  { id: 'toggle-mute', label: 'Toggle mute', kind: 'audio', aliases: ['mute', 'unmute', 'silence'] },
  { id: 'system-status', label: 'System status', kind: 'system', aliases: ['battery', 'disk', 'network status'] },
  { id: 'toggle-theme', label: 'Toggle theme', kind: 'system', aliases: ['dark mode', 'light mode'] },
  { id: 'clipboard-to-chat', label: 'Ask about clipboard', kind: 'clipboard', aliases: ['paste', 'copied text'] },
  { id: 'focus-zuraai', label: 'Focus ZuraAI', kind: 'app', aliases: ['show zura', 'open zura'] },
  { id: 'settings-display', label: 'Display settings', kind: 'settings', aliases: ['screen', 'monitor'] },
  { id: 'settings-sound', label: 'Sound settings', kind: 'settings', aliases: ['audio settings', 'speaker'] },
  { id: 'settings-network', label: 'Network settings', kind: 'settings', aliases: ['wifi', 'wi-fi', 'internet'] },
  { id: 'settings-bluetooth', label: 'Bluetooth settings', kind: 'settings', aliases: ['devices'] },
  { id: 'open-downloads', label: 'Open Downloads', kind: 'filesystem', aliases: ['downloads folder'] },
] as const

let extensionEnabled = false
let shortcutRegistered = false

type CommandCenterActionId = (typeof COMMAND_CENTER_ACTIONS)[number]['id']

type CommandCenterIndexItem =
  | {
      id: string
      type: 'workflow'
      title: string
      subtitle?: string
      hint: 'Workflow'
      aliases: string[]
      workflow: CommandCenterWorkflow
    }
  | {
      id: string
      type: 'app'
      title: string
      subtitle?: string
      hint: 'Application'
      aliases: string[]
      appPath: string
      iconDataUrl?: string
      existingWindow?: WindowMatch
    }
  | {
      id: string
      type: 'window'
      title: string
      subtitle?: string
      hint: 'Window'
      aliases: string[]
      hwnd: number
      processName: string
      processId: number
    }
  | {
      id: string
      type: 'action'
      title: string
      subtitle?: string
      hint: 'Action'
      aliases: string[]
      actionId: CommandCenterActionId
    }
  | {
      id: string
      type: 'chat'
      title: string
      subtitle?: string
      hint: 'Chat'
      aliases: string[]
      sessionId: string
    }

interface CommandCenterIndex {
  workflows: CommandCenterIndexItem[]
  apps: CommandCenterIndexItem[]
  windows: CommandCenterIndexItem[]
  actions: CommandCenterIndexItem[]
  chats: CommandCenterIndexItem[]
}

interface WindowMatch {
  hwnd: number
  title: string
  processName: string
  processId: number
}

function compactText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function normalizeWindows(raw: unknown): WindowMatch[] {
  if (!raw || typeof raw !== 'object') return []
  const windows = (raw as Record<string, unknown>).windows
  if (!Array.isArray(windows)) return []
  return windows.flatMap((entry): WindowMatch[] => {
    if (!entry || typeof entry !== 'object') return []
    const record = entry as Record<string, unknown>
    if (
      typeof record.hwnd !== 'number' ||
      typeof record.title !== 'string' ||
      typeof record.processName !== 'string' ||
      typeof record.processId !== 'number'
    ) {
      return []
    }
    return [{
      hwnd: record.hwnd,
      title: record.title,
      processName: record.processName,
      processId: record.processId,
    }]
  })
}

function findExistingAppWindow(appName: string, windows: WindowMatch[]): WindowMatch | undefined {
  const appKey = compactText(appName)
  return windows.find((window) => {
    const processKey = compactText(window.processName)
    const titleKey = compactText(window.title)
    return processKey.includes(appKey) || appKey.includes(processKey) || titleKey.includes(appKey)
  })
}

async function getWindowMatches(): Promise<WindowMatch[]> {
  const result = await executeWindowList()
  return result.success ? normalizeWindows(result.data) : []
}

async function getAppIconDataUrl(appPath: string): Promise<string | undefined> {
  try {
    const image = await electronApp.getFileIcon(appPath, { size: 'normal' })
    if (image.isEmpty()) return undefined
    return image.toDataURL()
  } catch {
    return undefined
  }
}

async function buildCommandCenterIndex(): Promise<CommandCenterIndex> {
  const [workflows, appsResult, windows, chats] = await Promise.all([
    listCommandCenterWorkflows(),
    executeAppList(),
    getWindowMatches(),
    getSessionMetadataAsync().catch(() => []),
  ])

  const appRows = appsResult.success &&
    appsResult.data &&
    typeof appsResult.data === 'object' &&
    Array.isArray((appsResult.data as Record<string, unknown>).apps)
    ? await Promise.all(((appsResult.data as Record<string, unknown>).apps as Array<Record<string, unknown>>)
      .filter((app) => typeof app.name === 'string' && typeof app.path === 'string')
      .slice(0, 120)
      .map(async (app) => {
        const name = String(app.name)
        const appPath = String(app.path)
        const existingWindow = findExistingAppWindow(name, windows)
        return {
          id: `app:${Buffer.from(appPath).toString('base64url')}`,
          type: 'app' as const,
          title: name,
          subtitle: existingWindow ? existingWindow.title : 'Application',
          hint: 'Application' as const,
          aliases: [name],
          appPath,
          iconDataUrl: await getAppIconDataUrl(appPath),
          existingWindow,
        }
      }))
    : []

  return {
    workflows: workflows
      .slice()
      .sort((a, b) => (b.lastRunAt ?? b.updatedAt) - (a.lastRunAt ?? a.updatedAt))
      .map((workflow) => ({
        id: `workflow:${workflow.id}`,
        type: 'workflow' as const,
        title: workflow.name,
        subtitle: workflow.description ?? `${workflow.steps.length} step${workflow.steps.length === 1 ? '' : 's'}`,
        hint: 'Workflow' as const,
        aliases: workflow.aliases,
        workflow,
      })),
    apps: appRows,
    windows: windows.slice(0, 80).map((window) => ({
      id: `window:${window.hwnd}`,
      type: 'window' as const,
      title: window.title,
      subtitle: window.processName,
      hint: 'Window' as const,
      aliases: [window.title, window.processName],
      hwnd: window.hwnd,
      processName: window.processName,
      processId: window.processId,
    })),
    actions: COMMAND_CENTER_ACTIONS.map((action) => ({
      id: `action:${action.id}`,
      type: 'action' as const,
      title: action.label,
      subtitle: action.kind,
      hint: 'Action' as const,
      aliases: [...(action.aliases ?? []), action.kind],
      actionId: action.id,
    })),
    chats: chats.slice(0, 40).map((chat) => ({
      id: `chat:${chat.id}`,
      type: 'chat' as const,
      title: chat.title,
      subtitle: `${chat.messageCount} message${chat.messageCount === 1 ? '' : 's'}`,
      hint: 'Chat' as const,
      aliases: [chat.title, ...(chat.tags ?? [])],
      sessionId: chat.id,
    })),
  }
}

async function getActiveWindowContext(): Promise<unknown | undefined> {
  const result = await executeSystemActiveWindow()
  return result.success ? result.data : undefined
}

async function sendCommandToMainWindow(text: string, sessionId?: string): Promise<void> {
  const win = getMainWindow() ?? createMainWindow()
  const payload = {
    text,
    receivedAt: Date.now(),
    activeWindow: await getActiveWindowContext(),
    sessionId,
  }

  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', () => {
      if (!win.isDestroyed()) {
        win.webContents.send('command-center:command', payload)
      }
    })
  } else {
    win.webContents.send('command-center:command', payload)
  }

  if (win.isMinimized()) {
    win.restore()
  }
  win.show()
  win.focus()
}

function registerShortcut(): boolean {
  if (shortcutRegistered) return true
  shortcutRegistered = globalShortcut.register(COMMAND_CENTER_SHORTCUT, () => {
    if (!extensionEnabled) return
    toggleCommandCenterWindow()
  })
  return shortcutRegistered
}

function isCommandCenterActionId(value: unknown): value is CommandCenterActionId {
  return typeof value === 'string' && COMMAND_CENTER_ACTIONS.some((action) => action.id === value)
}

async function executeCommandCenterAction(actionId: CommandCenterActionId) {
  switch (actionId) {
    case 'snap-left':
      return executeWindowSnap({ preset: 'left', autoApprove: true })
    case 'snap-right':
      return executeWindowSnap({ preset: 'right', autoApprove: true })
    case 'maximize-window':
      return executeWindowSnap({ preset: 'maximize', autoApprove: true })
    case 'volume-30':
      return executeSystemVolumeSet({ level: 30, autoApprove: true })
    case 'volume-60':
      return executeSystemVolumeSet({ level: 60, autoApprove: true })
    case 'toggle-mute': {
      const current = await executeSystemVolumeGet()
      const muted = current.success &&
        current.data &&
        typeof current.data === 'object' &&
        (current.data as Record<string, unknown>).muted === true
      return executeSystemMuteSet({ muted: !muted, autoApprove: true })
    }
    case 'system-status':
      return executeSystemStatus()
    case 'toggle-theme': {
      const current = await executeSystemThemeGet()
      const appTheme = current.success &&
        current.data &&
        typeof current.data === 'object' &&
        (current.data as Record<string, unknown>).appTheme === 'dark'
        ? 'dark'
        : 'light'
      return executeSystemThemeSet({ theme: appTheme === 'dark' ? 'light' : 'dark', autoApprove: true })
    }
    case 'clipboard-to-chat': {
      const text = clipboard.readText().trim()
      if (!text) {
        return { success: false, error: 'Clipboard does not contain text.' }
      }
      const clipped = text.length > MAX_CLIPBOARD_CONTEXT_LENGTH
        ? `${text.slice(0, MAX_CLIPBOARD_CONTEXT_LENGTH)}\n...[clipboard truncated]`
        : text
      await sendCommandToMainWindow(`Help me with this clipboard text:\n\n${clipped}`)
      hideCommandCenterWindow()
      return { success: true, data: { queued: true, characterCount: text.length } }
    }
    case 'focus-zuraai': {
      const win = getMainWindow() ?? createMainWindow()
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
      hideCommandCenterWindow()
      return { success: true, data: { focused: true } }
    }
    case 'settings-display':
      return executeSystemSettingsOpen({ page: 'display', autoApprove: true })
    case 'settings-sound':
      return executeSystemSettingsOpen({ page: 'sound', autoApprove: true })
    case 'settings-network':
      return executeSystemSettingsOpen({ page: 'network', autoApprove: true })
    case 'settings-bluetooth':
      return executeSystemSettingsOpen({ page: 'bluetooth', autoApprove: true })
    case 'open-downloads':
      return executeSystemOpenPath({
        path: path.join(os.homedir(), 'Downloads'),
        autoApprove: true,
      })
  }
}

function flattenIndex(index: CommandCenterIndex): CommandCenterIndexItem[] {
  return [
    ...index.workflows,
    ...index.apps,
    ...index.windows,
    ...index.actions,
    ...index.chats,
  ]
}

async function executeWorkflow(workflowId: unknown) {
  if (typeof workflowId !== 'string' || !workflowId.trim()) {
    return { success: false, error: 'Workflow id is required.' }
  }

  const workflow = (await listCommandCenterWorkflows()).find((entry) => entry.id === workflowId)
  if (!workflow) return { success: false, error: 'Workflow was not found.' }

  for (const step of workflow.steps) {
    if (step.type === 'action') {
      if (!isCommandCenterActionId(step.actionId)) {
        return { success: false, error: `Workflow action "${step.actionId}" is not allowed.` }
      }
      const result = await executeCommandCenterAction(step.actionId)
      if (!result.success) return result
    } else if (step.type === 'app') {
      const result = await executeAppLaunch({ nameOrPath: step.appPath, autoApprove: true })
      if (!result.success) return result
    } else if (step.type === 'window') {
      const result = await executeWindowFocus({ hwnd: step.hwnd, autoApprove: true })
      if (!result.success) return result
    } else if (step.type === 'ai') {
      await markCommandCenterWorkflowRun(workflow.id)
      return { success: true, aiPrompt: step.prompt }
    }
  }

  await markCommandCenterWorkflowRun(workflow.id)
  return { success: true, data: { workflowId: workflow.id } }
}

async function executeIndexItem(itemId: unknown) {
  if (typeof itemId !== 'string' || !itemId.trim()) {
    return { success: false, error: 'Command Center item id is required.' }
  }

  const item = flattenIndex(await buildCommandCenterIndex()).find((candidate) => candidate.id === itemId)
  if (!item) return { success: false, error: 'Command Center item was not found.' }

  if (item.type === 'workflow') return executeWorkflow(item.workflow.id)
  if (item.type === 'app') {
    if (item.existingWindow) {
      return executeWindowFocus({ hwnd: item.existingWindow.hwnd, autoApprove: true })
    }
    return executeAppLaunch({ nameOrPath: item.appPath, autoApprove: true })
  }
  if (item.type === 'window') return executeWindowFocus({ hwnd: item.hwnd, autoApprove: true })
  if (item.type === 'action') return executeCommandCenterAction(item.actionId)
  if (item.type === 'chat') {
    await sendCommandToMainWindow('', item.sessionId)
    hideCommandCenterWindow()
    return { success: true, sessionId: item.sessionId }
  }

  return { success: false, error: 'Unsupported Command Center item.' }
}

function unregisterShortcut(): void {
  if (!shortcutRegistered) return
  globalShortcut.unregister(COMMAND_CENTER_SHORTCUT)
  shortcutRegistered = false
}

export function setCommandCenterExtensionEnabled(enabled: boolean): {
  enabled: boolean
  shortcut: string
  shortcutRegistered: boolean
} {
  extensionEnabled = enabled
  if (enabled) {
    registerShortcut()
  } else {
    unregisterShortcut()
    hideCommandCenterWindow()
  }

  return {
    enabled: extensionEnabled,
    shortcut: COMMAND_CENTER_SHORTCUT,
    shortcutRegistered,
  }
}

export function disposeCommandCenter(): void {
  unregisterShortcut()
  extensionEnabled = false
}

export function registerCommandCenterHandlers(): void {
  ipcMain.handle('command-center:set-extension-enabled', (_event, enabled: unknown) => {
    return setCommandCenterExtensionEnabled(enabled === true)
  })

  ipcMain.handle('command-center:show', () => {
    if (!extensionEnabled) return false
    showCommandCenterWindow()
    return true
  })

  ipcMain.handle('command-center:hide', () => {
    hideCommandCenterWindow()
    return true
  })

  ipcMain.handle('command-center:get-context', async () => {
    return executeSystemActiveWindow()
  })

  ipcMain.handle('command-center:list-actions', () => {
    return [...COMMAND_CENTER_ACTIONS]
  })

  ipcMain.handle('command-center:get-index', async () => {
    return buildCommandCenterIndex()
  })

  ipcMain.handle('command-center:save-workflow', async (_event, workflow: unknown) => {
    return saveCommandCenterWorkflow(workflow)
  })

  ipcMain.handle('command-center:delete-workflow', async (_event, id: unknown) => {
    return deleteCommandCenterWorkflow(id)
  })

  ipcMain.handle('command-center:execute-action', async (_event, actionId: unknown) => {
    if (!extensionEnabled) {
      return { success: false, error: 'Command Center is disabled.' }
    }
    if (!isCommandCenterActionId(actionId)) {
      return { success: false, error: 'Command Center action is not allowed.' }
    }
    return executeCommandCenterAction(actionId)
  })

  ipcMain.handle('command-center:execute-index-item', async (_event, itemId: unknown) => {
    if (!extensionEnabled) {
      return { success: false, error: 'Command Center is disabled.' }
    }
    return executeIndexItem(itemId)
  })

  ipcMain.handle('command-center:execute-workflow', async (_event, workflowId: unknown) => {
    if (!extensionEnabled) {
      return { success: false, error: 'Command Center is disabled.' }
    }
    return executeWorkflow(workflowId)
  })

  ipcMain.handle('command-center:open-chat-session', async (_event, sessionId: unknown) => {
    if (!extensionEnabled || typeof sessionId !== 'string' || !sessionId.trim()) {
      return false
    }
    await sendCommandToMainWindow('', sessionId.trim())
    hideCommandCenterWindow()
    return true
  })

  ipcMain.handle('command-center:set-layout', (_event, layout: unknown) => {
    if (layout !== 'search' && layout !== 'chat') {
      throw new Error('Invalid Command Center layout.')
    }
    setCommandCenterWindowLayout(layout)
    return true
  })

  ipcMain.handle('command-center:submit-command', async (_event, text: unknown) => {
    if (!extensionEnabled || typeof text !== 'string') {
      return { accepted: false, reason: 'Command Center is disabled.' }
    }

    const trimmed = text.trim()
    if (!trimmed) {
      return { accepted: false, reason: 'Command text is required.' }
    }

    await sendCommandToMainWindow(trimmed)
    hideCommandCenterWindow()
    return { accepted: true }
  })
}

export function unregisterCommandCenterHandlers(): void {
  ipcMain.removeHandler('command-center:set-extension-enabled')
  ipcMain.removeHandler('command-center:show')
  ipcMain.removeHandler('command-center:hide')
  ipcMain.removeHandler('command-center:get-context')
  ipcMain.removeHandler('command-center:list-actions')
  ipcMain.removeHandler('command-center:get-index')
  ipcMain.removeHandler('command-center:save-workflow')
  ipcMain.removeHandler('command-center:delete-workflow')
  ipcMain.removeHandler('command-center:execute-action')
  ipcMain.removeHandler('command-center:execute-index-item')
  ipcMain.removeHandler('command-center:execute-workflow')
  ipcMain.removeHandler('command-center:open-chat-session')
  ipcMain.removeHandler('command-center:set-layout')
  ipcMain.removeHandler('command-center:submit-command')
}

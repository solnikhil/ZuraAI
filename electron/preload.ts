import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { writeFileSync, existsSync, mkdirSync } from 'fs'

contextBridge.exposeInMainWorld('ipcRenderer', {
    on: (channel: string, listener: (event: IpcRendererEvent, ...args: any[]) => void) => {
        ipcRenderer.on(channel, listener)
    },
    off: (channel: string, listener: (event: IpcRendererEvent, ...args: any[]) => void) => {
        ipcRenderer.off(channel, listener)
    },
    send: (channel: string, ...args: any[]) => {
        ipcRenderer.send(channel, ...args)
    },
    invoke: (channel: string, ...args: any[]) => {
        return ipcRenderer.invoke(channel, ...args)
    },
})

// Window controls API (custom title bar)
contextBridge.exposeInMainWorld('windowControls', {
    minimize: () => ipcRenderer.invoke('window-controls:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window-controls:toggle-maximize'),
    close: () => ipcRenderer.invoke('window-controls:close'),
    isMaximized: () => ipcRenderer.invoke('window-controls:is-maximized'),
    onWindowState: (callback: (state: { isMaximized: boolean }) => void) => {
        const listener = (_event: IpcRendererEvent, state: { isMaximized: boolean }) => {
            callback(state)
        }
        ipcRenderer.on('window-controls:state', listener)
        return () => ipcRenderer.removeListener('window-controls:state', listener)
    },
})
preloadLog('Preload script STARTED')

// ----------------------------------------------------------------------------
// IPC hardening
// ----------------------------------------------------------------------------
// Only allow a small set of channels to be used by the renderer.
// This prevents arbitrary IPC access if the renderer is compromised.

const SEND_CHANNELS = new Set<string>([
  'close-overlay',
  'set-ignore-mouse-events',
  'open-settings',
  'set-titlebar-overlay',
  'spawn-terminal-command',
])

// PDF IPC channels - imported from src/types/pdf.ts for reference
// These channels support the PDF Reader Chat feature with RAG capabilities

const INVOKE_CHANNELS = new Set<string>([
  // Chat store
  'chat-store:get-all',
  'chat-store:save-all',
  'chat-store:migrate',

  // Secure storage
  'secure-storage:get',
  'secure-storage:set',
  'secure-storage:get-all',
  'secure-storage:clear',
  'secure-storage:status',

  // Screenshot
  'capture-screen',
  'crop-screenshot',

  // Tools
  'execute-tool',

  // Updater
  'updater:check-for-updates',
  'updater:quit-and-install',
  'updater:get-version',

  // PDF Loading & Parsing
  'pdf:load',
  'pdf:get-page',
  'pdf:search-text',
  'pdf:get-outline',
  'pdf:unload',

  // PDF Indexing
  'pdf:index',
  'pdf:get-index-status',
  'pdf:delete-index',

  // PDF RAG Query
  'pdf:query',
  'pdf:get-chunks',

  // PDF Session Management
  'pdf-chat:create-session',
  'pdf-chat:get-sessions',
  'pdf-chat:get-session',
  'pdf-chat:save-session',
  'pdf-chat:delete-session',

  // PDF Settings
  'pdf:get-settings',
  'pdf:update-settings',

  // PDF Feedback
  'pdf:save-feedback',
])

const ON_CHANNELS = new Set<string>([
  'update-available',
  'update-downloaded',

  // PDF Indexing Events (main process → renderer)
  'pdf:index-progress',
  'pdf:index-complete',
  'pdf:index-error',
])

function assertAllowed(kind: 'send' | 'invoke' | 'on' | 'off', channel: string, allowed: Set<string>) {
  if (!allowed.has(channel)) {
    throw new Error(`Blocked IPC ${kind} channel: ${channel}`)
  }
}

contextBridge.exposeInMainWorld('ipcRenderer', Object.freeze({
  on: (channel: string, listener: (event: IpcRendererEvent, ...args: any[]) => void) => {
    assertAllowed('on', channel, ON_CHANNELS)
    ipcRenderer.on(channel, listener)
  },
  off: (channel: string, listener: (event: IpcRendererEvent, ...args: any[]) => void) => {
    assertAllowed('off', channel, ON_CHANNELS)
    ipcRenderer.off(channel, listener)
  },
  send: (channel: string, ...args: any[]) => {
    assertAllowed('send', channel, SEND_CHANNELS)
    ipcRenderer.send(channel, ...args)
  },
  invoke: (channel: string, ...args: any[]) => {
    assertAllowed('invoke', channel, INVOKE_CHANNELS)

    // Extra validation for tool execution
    if (channel === 'execute-tool') {
      const toolName = args[0]
      if (toolName !== 'web_search') {
        return Promise.resolve({
          success: false,
          error: `Tool "${String(toolName)}" is disabled. Only "web_search" is available.`
        })
      }
    }

    return ipcRenderer.invoke(channel, ...args)
  },
}))

// Secure storage API
contextBridge.exposeInMainWorld('secureStorage', Object.freeze({
  get: (key: string) => ipcRenderer.invoke('secure-storage:get', key),
  set: (key: string, value: string) => ipcRenderer.invoke('secure-storage:set', key, value),
  getAll: () => ipcRenderer.invoke('secure-storage:get-all'),
  clear: () => ipcRenderer.invoke('secure-storage:clear'),
  getStatus: () => ipcRenderer.invoke('secure-storage:status'),
}))

// Auto-updater API
contextBridge.exposeInMainWorld('updater', Object.freeze({
  checkForUpdates: () => ipcRenderer.invoke('updater:check-for-updates'),
  quitAndInstall: () => ipcRenderer.invoke('updater:quit-and-install'),
  getVersion: () => ipcRenderer.invoke('updater:get-version'),
  onUpdateAvailable: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('update-available', listener)
    return () => ipcRenderer.off('update-available', listener)
  },
  onUpdateDownloaded: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('update-downloaded', listener)
    return () => ipcRenderer.off('update-downloaded', listener)
  },
}))

// Terminal API - expose spawnCommand for launching terminals
try {
  preloadLog('About to expose terminal API...')
  contextBridge.exposeInMainWorld('terminal', {
    spawnCommand: (command: string, args?: string[]) => {
      preloadLog(`terminal.spawnCommand called: ${command} ${JSON.stringify(args)}`)
      ipcRenderer.send('spawn-terminal-command', command, args ?? [])
      preloadLog('IPC send completed')
    },
  })
  preloadLog('terminal API exposed successfully')
} catch (error: any) {
  preloadLog(`Failed to expose terminal API: ${error.message}`)
  console.error('[PRELOAD] Failed to expose terminal API:', error.message, error.stack)
}

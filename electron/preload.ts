import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

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

<<<<<<< Updated upstream
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
=======
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
>>>>>>> Stashed changes

// Secure storage API
contextBridge.exposeInMainWorld('secureStorage', {
    get: (key: string) => ipcRenderer.invoke('secure-storage:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('secure-storage:set', key, value),
    getAll: () => ipcRenderer.invoke('secure-storage:get-all'),
    clear: () => ipcRenderer.invoke('secure-storage:clear'),
    getStatus: () => ipcRenderer.invoke('secure-storage:status'),
})

// Auto-updater API
contextBridge.exposeInMainWorld('updater', {
    checkForUpdates: () => ipcRenderer.invoke('updater:check-for-updates'),
    quitAndInstall: () => ipcRenderer.invoke('updater:quit-and-install'),
    getVersion: () => ipcRenderer.invoke('updater:get-version'),
    onUpdateAvailable: (callback: () => void) => {
        ipcRenderer.on('update-available', callback)
        return () => ipcRenderer.removeAllListeners('update-available')
    },
    onUpdateDownloaded: (callback: () => void) => {
        ipcRenderer.on('update-downloaded', callback)
        return () => ipcRenderer.removeAllListeners('update-downloaded')
    },
})

// Codex Authentication API
contextBridge.exposeInMainWorld('codexAuth', {
    initiateAuth: () => ipcRenderer.invoke('codex:initiate-auth'),
    getAuthState: () => ipcRenderer.invoke('codex:get-auth-state'),
    logout: () => ipcRenderer.invoke('codex:logout'),
    validateToken: () => ipcRenderer.invoke('codex:validate-token'),
    sendRequest: (params: { endpoint: string; method: string; body?: any }) =>
        ipcRenderer.invoke('codex:send-request', params),
    fetchModels: () => ipcRenderer.invoke('codex:fetch-models'),
    checkUsage: () => ipcRenderer.invoke('codex:check-usage'),
    getBaseInstructions: (modelSlug: string) => ipcRenderer.invoke('codex:get-base-instructions', modelSlug),
    // True SSE streaming support
    streamChat: (params: { messages: any[]; model: string; options?: any }) =>
        ipcRenderer.invoke('codex:stream-chat', params),
    onStreamChunk: (callback: (chunk: any) => void) => {
        const handler = (_: any, chunk: any) => callback(chunk)
        ipcRenderer.on('codex:stream-chunk', handler)
        return () => ipcRenderer.removeListener('codex:stream-chunk', handler)
    },
    onStreamDone: (callback: () => void) => {
        const handler = () => callback()
        ipcRenderer.on('codex:stream-done', handler)
        return () => ipcRenderer.removeListener('codex:stream-done', handler)
    },
    onStreamError: (callback: (error: { message: string }) => void) => {
        const handler = (_: any, error: { message: string }) => callback(error)
        ipcRenderer.on('codex:stream-error', handler)
        return () => ipcRenderer.removeListener('codex:stream-error', handler)
    }
})

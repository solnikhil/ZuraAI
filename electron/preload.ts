import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

const preloadLog = (message: string) => {
  console.log(`[PRELOAD] ${message}`)
}

preloadLog('Preload script STARTED')

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


// ----------------------------------------------------------------------------
// IPC hardening
// ----------------------------------------------------------------------------
// Only allow a small set of channels to be used by the renderer.
// This prevents arbitrary IPC access if the renderer is compromised.

const SEND_CHANNELS = new Set<string>([
  'open-settings',
  'set-titlebar-overlay',
  'set-native-blur',
  'spawn-terminal-command',
])

const INVOKE_CHANNELS = new Set<string>([
  // Chat store
  'chat-store:get-all',
  'chat-store:save-all',
  'chat-store:migrate',
  'chat-store:get-all-folders',
  'chat-store:save-folders',

  // Secure storage
  'secure-storage:get',
  'secure-storage:set',
  'secure-storage:get-all',

  // Process metrics
  'get-process-metrics',
  
  // Memory monitoring (Requirement 4.6, 6.6)
  'memory:get-metrics',
  'memory:force-cleanup',

  // Performance monitoring (Requirement 6.3)
  'performance:report-renderer-metrics',
  'performance:get-metrics',
  'performance:get-renderer-metrics',
  'performance:check-thresholds',

  // Tools
  'execute-tool',

  // Window resize (frosted mode)
  'window-resize',

  // Updater
  'updater:check-for-updates',
  'updater:quit-and-install',
  'updater:get-version',
])

const ON_CHANNELS = new Set<string>([
  'update-available',
  'update-downloaded',
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

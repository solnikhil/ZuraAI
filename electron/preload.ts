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
})
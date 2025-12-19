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
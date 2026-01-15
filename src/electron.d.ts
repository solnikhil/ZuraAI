export interface IElectronAPI {
    on: (channel: string, listener: (event: any, ...args: any[]) => void) => void
    off: (channel: string, listener: (event: any, ...args: any[]) => void) => void
    send: (channel: string, ...args: any[]) => void
    invoke: (channel: string, ...args: any[]) => Promise<any>
}

export interface StorageStatus {
    encryptionAvailable: boolean
    storageFileExists: boolean
    storagePath: string
    keyCount: number
    lastError: string | null
}

export interface SecureStorageAPI {
    get: (key: string) => Promise<string>
    set: (key: string, value: string) => Promise<boolean>
    getAll: () => Promise<Record<string, string>>
    clear: () => Promise<boolean>
    getStatus: () => Promise<StorageStatus>
}

export interface UpdaterAPI {
    checkForUpdates: () => Promise<any>
    quitAndInstall: () => Promise<boolean>
    getVersion: () => Promise<string>
    onUpdateAvailable: (callback: () => void) => () => void
    onUpdateDownloaded: (callback: () => void) => () => void
}

export interface TerminalAPI {
    spawnCommand: (command: string, args?: string[]) => void
}

declare global {
    interface Window {
        ipcRenderer: IElectronAPI
        secureStorage: SecureStorageAPI
        updater: UpdaterAPI
        terminal: TerminalAPI
    }
}

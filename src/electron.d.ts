export interface IElectronAPI {
    on: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => void
    off: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => void
    send: (channel: string, ...args: unknown[]) => void
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
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
}

export interface UpdaterAPI {
    checkForUpdates: () => Promise<unknown>
    quitAndInstall: () => Promise<boolean>
    getVersion: () => Promise<string>
    onUpdateAvailable: (callback: () => void) => () => void
    onUpdateDownloaded: (callback: () => void) => () => void
}

export interface TerminalAPI {
    spawnCommand: (command: string, args?: string[]) => void
}

export interface TestingArtifactsAPI {
    openRunFolder: (runId: string) => Promise<boolean>
    openTrace: (runId: string) => Promise<boolean>
}

export interface WindowControlsAPI {
    minimize: () => Promise<void>
    toggleMaximize: () => Promise<void>
    close: () => Promise<void>
    isMaximized: () => Promise<boolean>
    onWindowState: (callback: (state: { isMaximized: boolean }) => void) => () => void
}

declare global {
    interface Window {
        ipcRenderer: IElectronAPI
        secureStorage: SecureStorageAPI
        updater: UpdaterAPI
        terminal: TerminalAPI
        testingArtifacts: TestingArtifactsAPI
        windowControls: WindowControlsAPI
    }
}

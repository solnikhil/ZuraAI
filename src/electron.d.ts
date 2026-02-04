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

// =============================================================================
// Memory Monitoring Types (Requirements 4.6, 6.6)
// =============================================================================

/**
 * Memory metrics from the main process
 */
export interface MemoryMetrics {
    heapUsed: number;      // V8 heap used (bytes)
    heapTotal: number;     // V8 heap total (bytes)
    external: number;      // V8 external memory (bytes)
    rss: number;           // Resident Set Size (bytes)
    timestamp: number;     // When metrics were collected
}

/**
 * Memory cleanup result
 */
export interface MemoryCleanupResult {
    success: boolean;
    timestamp: number;
}

declare global {
    interface Window {
        ipcRenderer: IElectronAPI
        secureStorage: SecureStorageAPI
        updater: UpdaterAPI
        terminal: TerminalAPI
    }
}

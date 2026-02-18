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
    clear: () => Promise<boolean>
    getStatus: () => Promise<StorageStatus>
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
        windowControls: WindowControlsAPI
    }
}

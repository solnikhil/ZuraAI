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

export interface CodexAuthState {
    isAuthenticated: boolean
    userEmail?: string
    expiresAt?: number
    error?: string
}

export interface CodexAuthResult {
    success: boolean
    error?: string
}

export interface CodexRequestParams {
    endpoint: string
    method: string
    body?: any
}

export interface CodexRequestResponse {
    ok: boolean
    status: number
    statusText: string
    headers: Record<string, string>
    body: string
}

export interface CodexModel {
    code: string
    displayName: string
    owned_by?: string
}

export interface CodexModelsResult {
    success: boolean
    error?: string
    models: CodexModel[]
}

export interface CodexUsageLimit {
    used: number
    total: number
    resetAt?: number
}

export interface CodexRateLimitInfo {
    used: number
    total: number
    remaining: number
    resetIn?: string
}

export interface CodexRateLimits {
    requests?: CodexRateLimitInfo
    tokens?: CodexRateLimitInfo
    updatedAt?: number
}

export interface CodexUsageInfo {
    email?: string
    name?: string
    picture?: string
    plan?: string
    planType?: string
    organization?: string
    created?: number
    groups?: string[]
    limits5Day?: CodexUsageLimit
    limits7Day?: CodexUsageLimit
}

export interface CodexUsageResult {
    success: boolean
    error?: string
    usage?: CodexUsageInfo
    rateLimits?: CodexRateLimits
    note?: string
}

export interface CodexBaseInstructionsResult {
    success: boolean
    error?: string
    instructions: string | null
}

export interface CodexAuthAPI {
    initiateAuth: () => Promise<CodexAuthResult>
    getAuthState: () => Promise<CodexAuthState>
    logout: () => Promise<void>
    validateToken: () => Promise<boolean>
    sendRequest: (params: CodexRequestParams) => Promise<CodexRequestResponse>
    fetchModels: () => Promise<CodexModelsResult>
    checkUsage: () => Promise<CodexUsageResult>
    getBaseInstructions: (modelSlug: string) => Promise<CodexBaseInstructionsResult>
    // True SSE streaming support
    streamChat: (params: { messages: any[]; model: string; options?: any }) => Promise<{ success: boolean }>
    onStreamChunk: (callback: (chunk: any) => void) => () => void
    onStreamDone: (callback: () => void) => () => void
    onStreamError: (callback: (error: { message: string }) => void) => () => void
}

declare global {
    interface Window {
        ipcRenderer: IElectronAPI
        secureStorage: SecureStorageAPI
        updater: UpdaterAPI
        codexAuth: CodexAuthAPI
    }
}

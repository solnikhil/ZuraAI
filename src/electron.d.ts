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

export interface WindowControlsState {
    isMaximized: boolean
}

export interface WindowControlsAPI {
    minimize: () => Promise<boolean>
    toggleMaximize: () => Promise<boolean>
    close: () => Promise<boolean>
    isMaximized: () => Promise<boolean>
    onWindowState: (callback: (state: WindowControlsState) => void) => () => void
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

// =============================================================================
// PDF Reader Chat IPC Types
// =============================================================================

import type {
    PDFDocument,
    PDFPage,
    TextSearchResult,
    OutlineItem,
    IndexOptions,
    IndexResult,
    IndexStatus,
    QueryOptions,
    RAGResponse,
    Chunk,
    PDFChatSession,
    PDFRAGSettings,
    ResponseFeedback,
    CitationFeedback,
} from './types/pdf'

/**
 * PDF Loading & Parsing IPC methods
 */
export interface PDFLoadingAPI {
    /** Load a PDF document from file path */
    load: (filePath: string) => Promise<PDFDocument>
    /** Get a specific page from a loaded document */
    getPage: (docId: string, pageNum: number) => Promise<PDFPage>
    /** Search for text within a document */
    searchText: (docId: string, query: string) => Promise<TextSearchResult[]>
    /** Get the document outline (table of contents) */
    getOutline: (docId: string) => Promise<OutlineItem[]>
    /** Unload a document from memory */
    unload: (docId: string) => Promise<void>
}

/**
 * PDF Indexing IPC methods
 */
export interface PDFIndexingAPI {
    /** Index a document for RAG retrieval */
    index: (docId: string, options?: IndexOptions) => Promise<IndexResult>
    /** Get the indexing status of a document */
    getIndexStatus: (docId: string) => Promise<IndexStatus>
    /** Delete the index for a document */
    deleteIndex: (docId: string) => Promise<void>
}

/**
 * PDF RAG Query IPC methods
 */
export interface PDFQueryAPI {
    /** Query documents using RAG */
    query: (query: string, docIds: string[], options?: QueryOptions) => Promise<RAGResponse>
    /** Get specific chunks by ID */
    getChunks: (docId: string, chunkIds: string[]) => Promise<Chunk[]>
}

/**
 * PDF Chat Session Management IPC methods
 */
export interface PDFSessionAPI {
    /** Create a new PDF chat session */
    createSession: (docIds: string[]) => Promise<PDFChatSession>
    /** Get all PDF chat sessions */
    getSessions: () => Promise<PDFChatSession[]>
    /** Get a specific session by ID */
    getSession: (sessionId: string) => Promise<PDFChatSession | null>
    /** Save/update a session */
    saveSession: (session: PDFChatSession) => Promise<void>
    /** Delete a session */
    deleteSession: (sessionId: string) => Promise<void>
}

/**
 * PDF Settings IPC methods
 */
export interface PDFSettingsAPI {
    /** Get current PDF RAG settings */
    getSettings: () => Promise<PDFRAGSettings>
    /** Update PDF RAG settings */
    updateSettings: (settings: Partial<PDFRAGSettings>) => Promise<void>
}

/**
 * PDF Feedback IPC methods
 */
export interface PDFFeedbackAPI {
    /** Save user feedback on a response or citation */
    saveFeedback: (feedback: ResponseFeedback | CitationFeedback) => Promise<void>
}

/**
 * PDF Indexing Event Callbacks
 */
export interface PDFIndexingEvents {
    /** Called when indexing progress updates */
    onIndexProgress: (callback: (docId: string, progress: number) => void) => () => void
    /** Called when indexing completes successfully */
    onIndexComplete: (callback: (docId: string, result: IndexResult) => void) => () => void
    /** Called when indexing fails */
    onIndexError: (callback: (docId: string, error: string) => void) => () => void
}

// =============================================================================
// PDF Reader Chat IPC Types
// =============================================================================

import type {
    PDFDocument,
    PDFPage,
    TextSearchResult,
    OutlineItem,
    IndexOptions,
    IndexResult,
    IndexStatus,
    QueryOptions,
    RAGResponse,
    Chunk,
    PDFChatSession,
    PDFRAGSettings,
    ResponseFeedback,
    CitationFeedback,
} from './types/pdf'

/**
 * PDF Loading & Parsing IPC methods
 */
export interface PDFLoadingAPI {
    /** Load a PDF document from file path */
    load: (filePath: string) => Promise<PDFDocument>
    /** Get a specific page from a loaded document */
    getPage: (docId: string, pageNum: number) => Promise<PDFPage>
    /** Search for text within a document */
    searchText: (docId: string, query: string) => Promise<TextSearchResult[]>
    /** Get the document outline (table of contents) */
    getOutline: (docId: string) => Promise<OutlineItem[]>
    /** Unload a document from memory */
    unload: (docId: string) => Promise<void>
}

/**
 * PDF Indexing IPC methods
 */
export interface PDFIndexingAPI {
    /** Index a document for RAG retrieval */
    index: (docId: string, options?: IndexOptions) => Promise<IndexResult>
    /** Get the indexing status of a document */
    getIndexStatus: (docId: string) => Promise<IndexStatus>
    /** Delete the index for a document */
    deleteIndex: (docId: string) => Promise<void>
}

/**
 * PDF RAG Query IPC methods
 */
export interface PDFQueryAPI {
    /** Query documents using RAG */
    query: (query: string, docIds: string[], options?: QueryOptions) => Promise<RAGResponse>
    /** Get specific chunks by ID */
    getChunks: (docId: string, chunkIds: string[]) => Promise<Chunk[]>
}

/**
 * PDF Chat Session Management IPC methods
 */
export interface PDFSessionAPI {
    /** Create a new PDF chat session */
    createSession: (docIds: string[]) => Promise<PDFChatSession>
    /** Get all PDF chat sessions */
    getSessions: () => Promise<PDFChatSession[]>
    /** Get a specific session by ID */
    getSession: (sessionId: string) => Promise<PDFChatSession | null>
    /** Save/update a session */
    saveSession: (session: PDFChatSession) => Promise<void>
    /** Delete a session */
    deleteSession: (sessionId: string) => Promise<void>
}

/**
 * PDF Settings IPC methods
 */
export interface PDFSettingsAPI {
    /** Get current PDF RAG settings */
    getSettings: () => Promise<PDFRAGSettings>
    /** Update PDF RAG settings */
    updateSettings: (settings: Partial<PDFRAGSettings>) => Promise<void>
}

/**
 * PDF Feedback IPC methods
 */
export interface PDFFeedbackAPI {
    /** Save user feedback on a response or citation */
    saveFeedback: (feedback: ResponseFeedback | CitationFeedback) => Promise<void>
}

/**
 * PDF Indexing Event Callbacks
 */
export interface PDFIndexingEvents {
    /** Called when indexing progress updates */
    onIndexProgress: (callback: (docId: string, progress: number) => void) => () => void
    /** Called when indexing completes successfully */
    onIndexComplete: (callback: (docId: string, result: IndexResult) => void) => () => void
    /** Called when indexing fails */
    onIndexError: (callback: (docId: string, error: string) => void) => () => void
}

declare global {
    interface Window {
        ipcRenderer: IElectronAPI
        secureStorage: SecureStorageAPI
        updater: UpdaterAPI
        codexAuth: CodexAuthAPI
        windowControls?: WindowControlsAPI
    }
}

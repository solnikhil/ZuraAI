import { registerChatStoreHandlers, unregisterChatStoreHandlers } from './chatStoreHandlers'
import { registerSecureStorageHandlers, unregisterSecureStorageHandlers } from './secureStorageHandlers'
import { registerSystemHandlers, unregisterSystemHandlers } from './systemHandlers'
import { registerPDFCoreHandlers, unregisterPDFCoreHandlers } from './pdfCoreHandlers'
import { registerPerformanceHandlers, unregisterPerformanceHandlers } from './performanceHandlers'

// PDF handlers are loaded as a regular import
// This allows vite to bundle them properly
// Native module failures will be caught at runtime
let pdfHandlersLoaded = false
let pdfCoreHandlersLoaded = false

// Import PDF handlers - this lets vite bundle them properly
// Any native module errors will be caught when registerPDFHandlers() is called
import * as PDFHandlersModule from './pdfHandlers'

let pdfHandlersImportError: Error | null = null

// Check if PDF handlers module loaded successfully at module load time
// If there's a native module issue, it will show up when we try to use it
let pdfHandlersModuleAvailable = true
try {
    // Test if the module has the expected exports
    if (typeof PDFHandlersModule.registerPDFHandlers !== 'function') {
        pdfHandlersModuleAvailable = false
        pdfHandlersImportError = new Error('PDF handlers module does not export registerPDFHandlers')
    }
} catch (error) {
    pdfHandlersModuleAvailable = false
    pdfHandlersImportError = error instanceof Error ? error : new Error(String(error))
}

/**
 * Register all IPC handlers for the main process
 */
export function registerAllHandlers(): void {
    // Register core handlers (these should always work)
    registerChatStoreHandlers()
    registerSecureStorageHandlers()
    registerSystemHandlers()
    registerPerformanceHandlers()
    
    // Register core PDF handlers first - these only use pdf.js (no LanceDB)
    // and provide basic PDF loading/viewing functionality
    try {
        registerPDFCoreHandlers()
        pdfCoreHandlersLoaded = true
    } catch (error) {
        console.warn('[IPC] Failed to register PDF core handlers:', 
            error instanceof Error ? error.message : String(error))
        pdfCoreHandlersLoaded = false
    }
    
    // Try to register full PDF handlers - these depend on LanceDB native module
    // which may fail to load in some environments (dev mode, missing binaries, etc.)
    if (pdfHandlersImportError) {
        console.warn('[IPC] Failed to load PDF handlers (PDF RAG features will be unavailable):',
            pdfHandlersImportError.message)
        pdfHandlersLoaded = false

        // Register stub handlers for RAG-specific operations
        // Core handlers are already registered above
        registerPDFStubHandlers()
    } else if (pdfHandlersModuleAvailable) {
        try {
            PDFHandlersModule.registerPDFHandlers()
            pdfHandlersLoaded = true
            console.log('[IPC] PDF handlers registered successfully')
        } catch (error) {
            console.warn('[IPC] Failed to register PDF handlers (PDF RAG features will be unavailable):',
                error instanceof Error ? error.message : String(error))
            pdfHandlersLoaded = false

            // Register stub handlers for RAG-specific operations
            registerPDFStubHandlers()
        }
    } else {
        console.warn('[IPC] PDF handlers module not available (PDF RAG features will be unavailable)')
        registerPDFStubHandlers()
    }
}

/**
 * Register stub handlers for PDF RAG operations when the full PDF module fails to load.
 * These handlers return graceful defaults instead of crashing or throwing errors.
 * This allows the app to function normally with PDF RAG features simply unavailable.
 * 
 * NOTE: Core PDF handlers (pdf:load, pdf:get-page, pdf:unload, pdf:search-text, 
 * pdf:get-outline, pdf:get-major-sections) are registered separately in pdfCoreHandlers.ts
 * and are NOT included here.
 */
function registerPDFStubHandlers(): void {
    const { ipcMain } = require('electron')
    
    // Handlers that should return empty arrays
    // NOTE: pdf:search-text, pdf:get-outline, pdf:get-major-sections are handled by core handlers
    const arrayHandlers = [
        'pdf-chat:get-sessions',
        'pdf-chat:get-recent-documents',
        'pdf:get-chunks',
        'pdf:get-feedback',
        'pdf:get-all-document-settings',
        'pdf:get-indexed-documents',
        'pdf:get-documents-needing-reindex',
        'pdf:get-documents-needing-rebuild',
    ]
    
    // Handlers that should return null
    const nullHandlers = [
        'pdf-chat:get-session',
        'pdf:get-document-settings',
        'pdf:get-embedding-fallback-notification',
    ]
    
    // Handlers that should return void/undefined (fire-and-forget operations)
    // NOTE: pdf:unload is handled by core handlers
    const voidHandlers = [
        'pdf:delete-index',
        'pdf-chat:save-session',
        'pdf-chat:delete-session',
        'pdf:update-settings',
        'pdf:save-feedback',
        'pdf:update-document-settings',
        'pdf:delete-document-settings',
        'pdf:clear-model-cache',
    ]
    
    // Handlers that need specific stub responses
    const specificHandlers: Record<string, () => any> = {
        'pdf:get-index-status': () => ({
            isIndexed: false,
            chunkCount: 0,
            isIndexing: false,
        }),
        'pdf:get-settings': () => ({
            chunkSize: 512,
            chunkOverlap: 128,
            chunkingStrategy: 'semantic',
            embeddingModel: 'local',
            localEmbeddingModel: 'nomic-embed-text',
            embeddingDimensions: 768,
            topK: 5,
            minConfidenceScore: 0.5,
            useHybridSearch: true,
            hybridAlpha: 0.7,
            useReranker: true,
            maxSourcesInContext: 8,
            groundedModeEnabled: false,
            showLowConfidenceWarning: true,
            lowConfidenceThreshold: 0.5,
        }),
        'pdf:get-embedding-fallback-state': () => ({
            isActive: false,
            failureCount: 0,
            canRecover: true,
            reason: 'PDF module not loaded',
        }),
        'pdf:check-embedding-availability': () => ({
            available: false,
            state: {
                isActive: false,
                failureCount: 0,
                canRecover: true,
            },
        }),
        'pdf:check-index-corruption': () => ({
            isCorrupted: false,
            isHealthy: true,
            issues: [],
            checkedAt: Date.now(),
            documentsChecked: 0,
            chunksChecked: 0,
            rebuildRecommended: false,
            summary: 'PDF module not loaded',
        }),
        'pdf:attempt-embedding-recovery': () => ({
            success: false,
            state: {
                isActive: false,
                failureCount: 0,
                canRecover: false,
                lastError: 'PDF module not loaded',
            },
        }),
        'pdf:check-model-change': () => ({
            documentsNeedingReindex: [],
            currentModelId: '',
            newModelId: '',
            hasDocumentsToReindex: false,
        }),
        'pdf:get-all-models-status': () => ({
            models: [],
            hasAvailableModels: false,
        }),
        'pdf:cleanup-orphaned-chunks': () => ({
            success: true,
            removed: 0,
            errors: [],
        }),
        'pdf:repair-chunk-counts': () => ({
            success: true,
            repaired: 0,
            errors: [],
        }),
    }
    
    // Handlers that should throw (operations that truly require full PDF RAG)
    // NOTE: pdf:load, pdf:get-page are handled by core handlers
    const errorHandlers = [
        'pdf:index',
        'pdf:query',
        'pdf:summarize-document',
        'pdf-chat:create-session',
        'pdf:get-model-cache-status',
        'pdf:download-model',
        'pdf:refresh-model-status',
        'pdf:reindex-documents',
        'pdf:rebuild-corrupted-index',
    ]
    
    // Register array handlers
    for (const channel of arrayHandlers) {
        ipcMain.handle(channel, async () => [])
    }
    
    // Register null handlers
    for (const channel of nullHandlers) {
        ipcMain.handle(channel, async () => null)
    }
    
    // Register void handlers
    for (const channel of voidHandlers) {
        ipcMain.handle(channel, async () => undefined)
    }
    
    // Register specific handlers
    for (const [channel, handler] of Object.entries(specificHandlers)) {
        ipcMain.handle(channel, async () => handler())
    }
    
    // Register error handlers (for operations that truly need PDF)
    for (const channel of errorHandlers) {
        ipcMain.handle(channel, async () => {
            throw new Error('PDF features are currently unavailable. The PDF module failed to load due to a native dependency issue.')
        })
    }
    
    const totalHandlers = arrayHandlers.length + nullHandlers.length + voidHandlers.length + 
        Object.keys(specificHandlers).length + errorHandlers.length
    console.log('[IPC] Registered PDF stub handlers for', totalHandlers, 'channels (graceful fallbacks)')
}

/**
 * Unregister all IPC handlers (for cleanup)
 */
export function unregisterAllHandlers(): void {
    unregisterChatStoreHandlers()
    unregisterSecureStorageHandlers()
    unregisterSystemHandlers()
    unregisterPerformanceHandlers()

    if (pdfCoreHandlersLoaded) {
        unregisterPDFCoreHandlers()
    }

    if (pdfHandlersLoaded && pdfHandlersModuleAvailable) {
        PDFHandlersModule.unregisterPDFHandlers()
    }
}

// Re-export individual handler modules for granular control
export { registerChatStoreHandlers, unregisterChatStoreHandlers } from './chatStoreHandlers'
export { registerSecureStorageHandlers, unregisterSecureStorageHandlers } from './secureStorageHandlers'
export { registerSystemHandlers, unregisterSystemHandlers } from './systemHandlers'
export { registerPDFCoreHandlers, unregisterPDFCoreHandlers } from './pdfCoreHandlers'
export { registerPerformanceHandlers, unregisterPerformanceHandlers } from './performanceHandlers'
// Note: Full PDF handlers are NOT re-exported because they depend on native modules (LanceDB)
// that may fail to load. Use registerAllHandlers() which handles this gracefully.

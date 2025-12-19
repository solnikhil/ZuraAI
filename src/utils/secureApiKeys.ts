// Utility functions for managing API keys in secure storage

export async function loadApiKeysFromSecureStorage(): Promise<{
    openRouterApiKey: string
    perplexityApiKey: string
    geminiApiKey: string
    groqApiKey: string
}> {
    const defaults = {
        openRouterApiKey: '',
        perplexityApiKey: '',
        geminiApiKey: '',
        groqApiKey: '',
    }

    if (!window.secureStorage) {
        console.warn('[SecureApiKeys] Secure storage not available (not in Electron)')
        return defaults
    }

    try {
        const allKeys = await window.secureStorage.getAll()
        console.log('[SecureApiKeys] Loaded keys:', {
            openRouterApiKey: allKeys.openRouterApiKey ? '(set)' : '(empty)',
            perplexityApiKey: allKeys.perplexityApiKey ? '(set)' : '(empty)',
            geminiApiKey: allKeys.geminiApiKey ? '(set)' : '(empty)',
            groqApiKey: allKeys.groqApiKey ? '(set)' : '(empty)',
        })
        return {
            openRouterApiKey: allKeys.openRouterApiKey || '',
            perplexityApiKey: allKeys.perplexityApiKey || '',
            geminiApiKey: allKeys.geminiApiKey || '',
            groqApiKey: allKeys.groqApiKey || '',
        }
    } catch (error) {
        console.error('[SecureApiKeys] Failed to load API keys from secure storage:', error)
        return defaults
    }
}

export async function saveApiKeyToSecureStorage(
    key: 'openRouterApiKey' | 'perplexityApiKey' | 'geminiApiKey' | 'groqApiKey',
    value: string
): Promise<boolean> {
    if (!window.secureStorage) {
        console.warn('[SecureApiKeys] Secure storage not available (not in Electron)')
        return false
    }

    try {
        const success = await window.secureStorage.set(key, value)
        console.log(`[SecureApiKeys] Save ${key}:`, success ? 'success' : 'failed')
        return success
    } catch (error) {
        console.error(`[SecureApiKeys] Failed to save ${key} to secure storage:`, error)
        return false
    }
}

export async function migrateApiKeysFromLocalStorage(settings: any): Promise<boolean> {
    // Migrate API keys from localStorage to secure storage if they exist
    const keysToMigrate: Array<'openRouterApiKey' | 'perplexityApiKey' | 'geminiApiKey' | 'groqApiKey'> = [
        'openRouterApiKey',
        'perplexityApiKey',
        'geminiApiKey',
        'groqApiKey',
    ]

    const hasMigrated = localStorage.getItem('zura-api-keys-migrated') === 'true'
    if (hasMigrated) {
        return true // Already migrated
    }

    if (!window.secureStorage) {
        console.warn('[SecureApiKeys] Secure storage not available for migration')
        return false
    }

    try {
        let migratedCount = 0
        for (const key of keysToMigrate) {
            if (settings[key] && settings[key].trim()) {
                const success = await window.secureStorage.set(key, settings[key])
                if (success) {
                    migratedCount++
                    console.log(`[SecureApiKeys] Migrated ${key}`)
                }
            }
        }

        if (migratedCount > 0 || keysToMigrate.every(k => !settings[k] || !settings[k].trim())) {
            localStorage.setItem('zura-api-keys-migrated', 'true')
            console.log(`[SecureApiKeys] Migration complete, migrated ${migratedCount} keys`)
        }
        return true
    } catch (error) {
        console.error('[SecureApiKeys] Failed to migrate API keys:', error)
        return false
    }
}

// Diagnostic function to check storage status
export async function getSecureStorageStatus(): Promise<{
    available: boolean
    encryptionAvailable: boolean
    storageFileExists: boolean
    keyCount: number
    lastError: string | null
} | null> {
    if (!window.secureStorage) {
        return null
    }

    try {
        const status = await window.secureStorage.getStatus()
        return {
            available: true,
            encryptionAvailable: status.encryptionAvailable,
            storageFileExists: status.storageFileExists,
            keyCount: status.keyCount,
            lastError: status.lastError,
        }
    } catch (error) {
        console.error('[SecureApiKeys] Failed to get storage status:', error)
        return {
            available: false,
            encryptionAvailable: false,
            storageFileExists: false,
            keyCount: 0,
            lastError: String(error),
        }
    }
}



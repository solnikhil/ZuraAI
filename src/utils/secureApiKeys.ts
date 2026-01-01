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
        return defaults
    }

    try {
        const allKeys = await window.secureStorage.getAll()
        return {
            openRouterApiKey: allKeys.openRouterApiKey || '',
            perplexityApiKey: allKeys.perplexityApiKey || '',
            geminiApiKey: allKeys.geminiApiKey || '',
            groqApiKey: allKeys.groqApiKey || '',
        }
    } catch (error) {
        console.error('[SecureApiKeys] Failed to load:', error)
        return defaults
    }
}

export async function saveApiKeyToSecureStorage(
    key: 'openRouterApiKey' | 'perplexityApiKey' | 'geminiApiKey' | 'groqApiKey',
    value: string
): Promise<boolean> {
    if (!window.secureStorage) {
        return false
    }

    try {
        return await window.secureStorage.set(key, value)
    } catch (error) {
        console.error(`[SecureApiKeys] Failed to save ${key}:`, error)
        return false
    }
}

export async function migrateApiKeysFromLocalStorage(settings: any): Promise<boolean> {
    const keysToMigrate: Array<'openRouterApiKey' | 'perplexityApiKey' | 'geminiApiKey' | 'groqApiKey'> = [
        'openRouterApiKey',
        'perplexityApiKey',
        'geminiApiKey',
        'groqApiKey',
    ]

    const hasMigrated = localStorage.getItem('zura-api-keys-migrated') === 'true'
    if (hasMigrated) {
        return true
    }

    if (!window.secureStorage) {
        return false
    }

    try {
        let migratedCount = 0
        for (const key of keysToMigrate) {
            if (settings[key] && settings[key].trim()) {
                const success = await window.secureStorage.set(key, settings[key])
                if (success) migratedCount++
            }
        }

        if (migratedCount > 0 || keysToMigrate.every(k => !settings[k] || !settings[k].trim())) {
            localStorage.setItem('zura-api-keys-migrated', 'true')
        }
        return true
    } catch (error) {
        console.error('[SecureApiKeys] Migration failed:', error)
        return false
    }
}

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
        return {
            available: false,
            encryptionAvailable: false,
            storageFileExists: false,
            keyCount: 0,
            lastError: String(error),
        }
    }
}

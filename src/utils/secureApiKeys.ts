// Utility functions for managing API keys in secure storage

type SecureStorageKey =
    | 'alibabaApiKey'
    | 'fireworksApiKey'
    | 'groqApiKey'
    | 'openRouterApiKey'
    | 'perplexityApiKey'
    | 'tavilyApiKey'
    | 'onlineCompilerApiKey'

const SECURE_API_KEY_NAMES: SecureStorageKey[] = [
    'alibabaApiKey',
    'fireworksApiKey',
    'groqApiKey',
    'openRouterApiKey',
    'perplexityApiKey',
    'tavilyApiKey',
    'onlineCompilerApiKey',
]

export async function loadApiKeysFromSecureStorage(): Promise<{
    alibabaApiKey: string
    fireworksApiKey: string
    groqApiKey: string
    openRouterApiKey: string
    perplexityApiKey: string
    tavilyApiKey: string
    onlineCompilerApiKey: string
}> {
    const defaults = {
        alibabaApiKey: '',
        fireworksApiKey: '',
        groqApiKey: '',
        openRouterApiKey: '',
        perplexityApiKey: '',
        tavilyApiKey: '',
        onlineCompilerApiKey: '',
    }

    if (!window.secureStorage) {
        return defaults
    }

    try {
        const all = await window.secureStorage.getAll()
        return {
            alibabaApiKey: all.alibabaApiKey || '',
            fireworksApiKey: all.fireworksApiKey || '',
            groqApiKey: all.groqApiKey || '',
            openRouterApiKey: all.openRouterApiKey || '',
            perplexityApiKey: all.perplexityApiKey || '',
            tavilyApiKey: all.tavilyApiKey || '',
            onlineCompilerApiKey: all.onlineCompilerApiKey || '',
        }
    } catch (error) {
        console.error('[SecureApiKeys] Failed to load:', error)
        return defaults
    }
}

export async function saveApiKeyToSecureStorage(
    key: SecureStorageKey,
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

export async function migrateApiKeysFromLocalStorage(settings: Record<string, string | undefined>): Promise<boolean> {
    const hasMigrated = localStorage.getItem('zura-api-keys-migrated') === 'true'
    if (hasMigrated) {
        return true
    }

    if (!window.secureStorage) {
        return false
    }

    try {
        let migratedCount = 0
        for (const key of SECURE_API_KEY_NAMES) {
            if (settings[key] && settings[key].trim()) {
                const success = await window.secureStorage.set(key, settings[key])
                if (success) migratedCount++
            }
        }

        if (migratedCount > 0 || SECURE_API_KEY_NAMES.every(k => !settings[k] || !settings[k].trim())) {
            localStorage.setItem('zura-api-keys-migrated', 'true')
        }
        return true
    } catch (error) {
        console.error('[SecureApiKeys] Migration failed:', error)
        return false
    }
}

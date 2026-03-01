// Utility functions for managing API keys in secure storage

type SecureStorageKey =
    | 'openRouterApiKey'
    | 'perplexityApiKey'
    | 'groqApiKey'
    | 'tavilyApiKey'
    | 'alibabaApiKey'

const SECURE_API_KEY_NAMES: SecureStorageKey[] = [
    'openRouterApiKey',
    'perplexityApiKey',
    'groqApiKey',
    'tavilyApiKey',
    'alibabaApiKey',
]

export async function loadApiKeysFromSecureStorage(): Promise<{
    openRouterApiKey: string
    perplexityApiKey: string
    groqApiKey: string
    tavilyApiKey: string
    alibabaApiKey: string
}> {
    const defaults = {
        openRouterApiKey: '',
        perplexityApiKey: '',
        groqApiKey: '',
        tavilyApiKey: '',
        alibabaApiKey: '',
    }

    if (!window.secureStorage) {
        return defaults
    }

    try {
        const [
            openRouterApiKey,
            perplexityApiKey,
            groqApiKey,
            tavilyApiKey,
            alibabaApiKey,
        ] = await Promise.all([
            window.secureStorage.get('openRouterApiKey'),
            window.secureStorage.get('perplexityApiKey'),
            window.secureStorage.get('groqApiKey'),
            window.secureStorage.get('tavilyApiKey'),
            window.secureStorage.get('alibabaApiKey'),
        ])

        return {
            openRouterApiKey: openRouterApiKey || '',
            perplexityApiKey: perplexityApiKey || '',
            groqApiKey: groqApiKey || '',
            tavilyApiKey: tavilyApiKey || '',
            alibabaApiKey: alibabaApiKey || '',
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

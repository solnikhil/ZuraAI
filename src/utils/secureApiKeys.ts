import {
    getProviderSecretFields,
    getProviderSettingsDefinition,
    type ProviderSecretField,
} from '../providers'
import type { ActiveProviderId } from '../providers/providerTypes'

// Utility functions for managing API keys in secure storage

type SecureStorageKey = ProviderSecretField | 'tavilyApiKey' | 'onlineCompilerApiKey' | 'brevoApiKey'

export const SECURE_API_KEY_NAMES: SecureStorageKey[] = [
    ...getProviderSecretFields(),
    'tavilyApiKey',
    'onlineCompilerApiKey',
    'brevoApiKey',
]

export const SECURE_API_KEY_PRESENT_VALUE = '__zura_secure_key_present__'

type SecureApiKeyValues = {
    alibabaApiKey: string
    deepseekApiKey: string
    opencodeGoApiKey: string
    fireworksApiKey: string
    groqApiKey: string
    nvidiaApiKey: string
    openRouterApiKey: string
    perplexityApiKey: string
    tavilyApiKey: string
    onlineCompilerApiKey: string
    brevoApiKey: string
}

function defaultSecureApiKeys(): SecureApiKeyValues {
    return {
        alibabaApiKey: '',
        deepseekApiKey: '',
        opencodeGoApiKey: '',
        fireworksApiKey: '',
        groqApiKey: '',
        nvidiaApiKey: '',
        openRouterApiKey: '',
        perplexityApiKey: '',
        tavilyApiKey: '',
        onlineCompilerApiKey: '',
        brevoApiKey: '',
    }
}

export function isSecureApiKeyPlaceholder(value: string | undefined): boolean {
    return value === SECURE_API_KEY_PRESENT_VALUE
}

export async function loadApiKeyPresenceFromSecureStorage(): Promise<SecureApiKeyValues> {
    const defaults = {
        ...defaultSecureApiKeys(),
    }

    if (!window.secureStorage) {
        return defaults
    }

    try {
        const presence = await window.secureStorage.getPresence()
        for (const key of SECURE_API_KEY_NAMES) {
            defaults[key] = presence[key] ? SECURE_API_KEY_PRESENT_VALUE : ''
        }
        return defaults
    } catch (error) {
        console.error('[SecureApiKeys] Failed to load key presence:', error)
        return defaults
    }
}

export async function loadApiKeysFromSecureStorage(): Promise<SecureApiKeyValues> {
    const defaults = defaultSecureApiKeys()

    if (!window.secureStorage) {
        return defaults
    }

    try {
        const all = await window.secureStorage.getAll()
        for (const key of SECURE_API_KEY_NAMES) {
            defaults[key] = all[key] || ''
        }
        return defaults
    } catch (error) {
        console.error('[SecureApiKeys] Failed to load:', error)
        return defaults
    }
}

export async function resolveApiKeyFromSecureStorage(
    key: SecureStorageKey,
    currentValue: string
): Promise<string> {
    if (!isSecureApiKeyPlaceholder(currentValue)) {
        return currentValue
    }

    if (!window.secureStorage) {
        return ''
    }

    try {
        return await window.secureStorage.get(key)
    } catch (error) {
        console.error(`[SecureApiKeys] Failed to resolve ${key}:`, error)
        return ''
    }
}

export async function resolveProviderApiKeysForSettings<TSettings extends object>(
    settings: TSettings,
    provider: ActiveProviderId
): Promise<TSettings> {
    const key = getProviderSettingsDefinition(provider)?.secretKeyField
    const settingsRecord = settings as Record<string, unknown>
    const currentValue = key ? settingsRecord[key] : undefined

    if (!key || typeof currentValue !== 'string' || !isSecureApiKeyPlaceholder(currentValue)) {
        return settings
    }

    const resolved = await resolveApiKeyFromSecureStorage(key, currentValue)
    return {
        ...settings,
        [key]: resolved,
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
            if (
                settings[key] &&
                settings[key].trim() &&
                !isSecureApiKeyPlaceholder(settings[key])
            ) {
                const success = await window.secureStorage.set(key, settings[key])
                if (success) migratedCount++
            }
        }

        const hasMigratableKeys = SECURE_API_KEY_NAMES.some(
            (key) => settings[key]?.trim() && !isSecureApiKeyPlaceholder(settings[key])
        )
        if (migratedCount > 0 || !hasMigratableKeys) {
            localStorage.setItem('zura-api-keys-migrated', 'true')
        }
        return true
    } catch (error) {
        console.error('[SecureApiKeys] Migration failed:', error)
        return false
    }
}

import { trustedIpcMain as ipcMain } from './trustedIpc'
import * as secureStorage from '../secureStorage'
import {
  getProviderSecretFields,
  type ProviderSecretField,
} from '../../src/providers/providerSettingsRegistry'

/**
 * Explicit allowlist of secrets whose presence the renderer may query and whose
 * values it may replace through this IPC boundary. Secret values never flow back
 * to the renderer.
 *
 * Keeping this list narrow is important for open-source safety because it makes
 * the exposed surface area easy to audit and prevents arbitrary key access from
 * being added implicitly.
 */
const ALLOWED_SECURE_STORAGE_KEYS = new Set([
  ...getProviderSecretFields(),
  'tavilyApiKey',
  'onlineCompilerApiKey',
  'brevoApiKey',
])

const ALLOWED_SECURE_STORAGE_KEY_LIST = [...ALLOWED_SECURE_STORAGE_KEYS] as const

type SecureStorageKey =
  | ProviderSecretField
  | 'tavilyApiKey'
  | 'onlineCompilerApiKey'
  | 'brevoApiKey'

function assertSecureStorageKey(key: string): asserts key is SecureStorageKey {
  if (!ALLOWED_SECURE_STORAGE_KEYS.has(key)) {
    throw new Error(`Invalid secure storage key: ${key}`)
  }
}

/**
 * Register secure-storage IPC handlers used by the preload bridge.
 *
 * These handlers are the only main-process entry points for persisted secrets.
 * Every key is validated against the allowlist above so the renderer cannot
 * request arbitrary values from the encrypted store.
 */
export function registerSecureStorageHandlers(): void {
  ipcMain.handle('secure-storage:set', async (_event, key: string, value: string) => {
    assertSecureStorageKey(key)
    // Use async version to ensure data is written to disk before returning
    return secureStorage.setSecureValueAsync(key, value)
  })

  ipcMain.handle('secure-storage:get-presence', async () => {
    return secureStorage.getSecureValuePresenceAsync(ALLOWED_SECURE_STORAGE_KEY_LIST)
  })
}

/**
 * Remove secure-storage IPC handlers during teardown or reload.
 */
export function unregisterSecureStorageHandlers(): void {
  ipcMain.removeHandler('secure-storage:set')
  ipcMain.removeHandler('secure-storage:get-presence')
}

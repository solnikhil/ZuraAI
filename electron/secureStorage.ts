// Secure storage for sensitive data like API keys
// Uses Electron's safeStorage API which encrypts data using OS keychain

import { safeStorage } from 'electron'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { writeFileAtomic } from './utils/atomicFile'

const STORAGE_FILE = path.join(app.getPath('userData'), 'secure-storage.json')

interface SecureData {
  openRouterApiKey?: string
  perplexityApiKey?: string
  groqApiKey?: string
  tavilyApiKey?: string
  alibabaApiKey?: string
  deepseekApiKey?: string
  fireworksApiKey?: string
  nvidiaApiKey?: string
  [key: string]: string | undefined
}

let cachedData: SecureData | null = null
let cacheTimestamp = 0
// Keep decrypted values in memory briefly to reduce repeated disk reads and decrypt work.
const CACHE_TTL = 30000

function isEncryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch (error) {
    console.warn('Unable to determine safeStorage encryption availability.', error)
    return false
  }
}

function isLikelyLegacyPlaintextSecret(value: string): boolean {
  return (
    value.startsWith('sk-') ||
    value.startsWith('pplx-') ||
    value.startsWith('tvly-') ||
    value.startsWith('dashscope-') ||
    value.startsWith('fw-') ||
    value.startsWith('nvapi-') ||
    value.length < 100
  )
}

async function readSecureDataAsync(): Promise<SecureData> {
  if (cachedData && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedData
  }

  try {
    if (!fsSync.existsSync(STORAGE_FILE)) {
      return {}
    }

    const data = await fs.readFile(STORAGE_FILE, 'utf-8')
    const parsed = JSON.parse(data)
    const encryptionAvailable = isEncryptionAvailable()

    if (!encryptionAvailable) {
      console.error('Secure storage unavailable: OS-backed encryption is required.')
      return {}
    }

    const decrypted: SecureData = {}
    let migratedLegacyPlaintext = false
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value) {
        try {
          decrypted[key as keyof SecureData] = safeStorage.decryptString(Buffer.from(value, 'base64'))
        } catch (error) {
          if (isLikelyLegacyPlaintextSecret(value)) {
            decrypted[key as keyof SecureData] = value
            migratedLegacyPlaintext = true
          } else {
            console.warn(`Failed to decrypt secure storage entry for key "${key}".`, error)
          }
        }
      }
    }

    if (migratedLegacyPlaintext) {
      const migrated = await writeSecureDataAsync(decrypted)
      if (!migrated) {
        console.error('Failed to migrate legacy plaintext secure storage entries.')
      }
    }

    cachedData = decrypted
    cacheTimestamp = Date.now()
    return decrypted
  } catch (error) {
    console.error('Failed to read secure storage data.', error)
    return {}
  }
}

export async function getSecureValuePresenceAsync(keys: readonly string[]): Promise<Record<string, boolean>> {
  const presence: Record<string, boolean> = {}
  for (const key of keys) {
    presence[key] = false
  }

  try {
    if (!fsSync.existsSync(STORAGE_FILE)) {
      return presence
    }

    const data = await fs.readFile(STORAGE_FILE, 'utf-8')
    const parsed = JSON.parse(data) as Record<string, unknown>

    for (const key of keys) {
      presence[key] = typeof parsed[key] === 'string' && parsed[key].trim().length > 0
    }

    return presence
  } catch (error) {
    console.error('Failed to read secure storage key presence.', error)
    return presence
  }
}

async function writeSecureDataAsync(data: SecureData): Promise<boolean> {
  try {
    if (!isEncryptionAvailable()) {
      console.error('Secure storage unavailable: refusing to persist secrets without encryption.')
      return false
    }

    const toWrite: Record<string, string> = {}

    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'string') {
        toWrite[key] = safeStorage.encryptString(value).toString('base64')
      }
    }

    await writeFileAtomic(STORAGE_FILE, JSON.stringify(toWrite, null, 2))
    cachedData = data
    cacheTimestamp = Date.now()
    return true
  } catch (error) {
    console.error('Failed to write secure storage data.', error)
    return false
  }
}

export async function getSecureValueAsync(key: string): Promise<string> {
  const data = await readSecureDataAsync()
  return data[key] || ''
}

export async function setSecureValueAsync(key: string, value: string): Promise<boolean> {
  const data = await readSecureDataAsync()
  if (value && value.trim()) {
    data[key] = value.trim()
  } else {
    delete data[key]
  }
  return writeSecureDataAsync(data)
}

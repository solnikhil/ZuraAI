// Secure storage for sensitive data like API keys
// Uses Electron's safeStorage API which encrypts data using OS keychain

import { safeStorage } from 'electron'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as path from 'path'
import { app } from 'electron'

const STORAGE_FILE = path.join(app.getPath('userData'), 'secure-storage.json')

interface SecureData {
  openRouterApiKey?: string
  perplexityApiKey?: string
  groqApiKey?: string
  tavilyApiKey?: string
  alibabaApiKey?: string
  [key: string]: string | undefined
}

let cachedData: SecureData | null = null
let cacheTimestamp = 0
// Keep decrypted values in memory briefly to reduce repeated disk reads and decrypt work.
const CACHE_TTL = 30000

function isEncryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
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

    const decrypted: SecureData = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value) {
        try {
          if (encryptionAvailable) {
            decrypted[key as keyof SecureData] = safeStorage.decryptString(
              Buffer.from(value, 'base64')
            )
          } else {
            decrypted[key as keyof SecureData] = value
          }
        } catch {
          if (
            value.startsWith('sk-') ||
            value.startsWith('pplx-') ||
            value.startsWith('tvly-') ||
            value.startsWith('dashscope-') ||
            value.length < 100
          ) {
            decrypted[key as keyof SecureData] = value
          }
        }
      }
    }

    cachedData = decrypted
    cacheTimestamp = Date.now()
    return decrypted
  } catch {
    return {}
  }
}

async function writeSecureDataAsync(data: SecureData): Promise<boolean> {
  try {
    const dir = path.dirname(STORAGE_FILE)
    if (!fsSync.existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true })
    }

    const encryptionAvailable = isEncryptionAvailable()
    const toWrite: Record<string, string> = {}

    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'string') {
        if (encryptionAvailable) {
          try {
            toWrite[key] = safeStorage.encryptString(value).toString('base64')
          } catch {
            toWrite[key] = value
          }
        } else {
          toWrite[key] = value
        }
      }
    }

    await fs.writeFile(STORAGE_FILE, JSON.stringify(toWrite, null, 2), 'utf-8')
    cachedData = data
    cacheTimestamp = Date.now()
    return true
  } catch {
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

export async function getAllSecureValuesAsync(): Promise<SecureData> {
  return readSecureDataAsync()
}

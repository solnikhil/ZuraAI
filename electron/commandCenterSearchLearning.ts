import { app } from 'electron'
import { createHmac, randomBytes } from 'crypto'
import fs from 'fs/promises'
import path from 'path'

import { normalizeSearchQuery } from '../src/commandCenter/search'
import { getSecureValueAsync, setSecureValueAsync } from './secureStorage'
import { writeFileAtomic } from './utils/atomicFile'

const STORE_FILE = path.join(app.getPath('userData'), 'command-center-search-learning.json')
const KEY_NAME = 'commandCenterSearchLearningKey'
const MAX_ENTRIES = 500
const HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000

interface LearningEntry {
  resultHash: string
  count: number
  lastSelectedAt: number
  queryHashes: string[]
}

interface LearningStore {
  version: 1
  entries: LearningEntry[]
}

let keyPromise: Promise<string> | null = null
let storePromise: Promise<LearningStore> | null = null

async function getLearningKey(): Promise<string> {
  if (!keyPromise) {
    keyPromise = (async () => {
      const existing = await getSecureValueAsync(KEY_NAME)
      if (existing) return existing
      const generated = randomBytes(32).toString('base64url')
      return (await setSecureValueAsync(KEY_NAME, generated)) ? generated : ''
    })()
  }
  return keyPromise
}

async function loadStore(): Promise<LearningStore> {
  if (!storePromise) {
    storePromise = fs
      .readFile(STORE_FILE, 'utf8')
      .then((raw) => JSON.parse(raw) as LearningStore)
      .then((parsed) => ({
        version: 1 as const,
        entries: Array.isArray(parsed.entries)
          ? parsed.entries.filter(
              (entry) =>
                typeof entry?.resultHash === 'string' &&
                typeof entry.count === 'number' &&
                typeof entry.lastSelectedAt === 'number' &&
                Array.isArray(entry.queryHashes)
            )
          : [],
      }))
      .catch(() => ({ version: 1 as const, entries: [] }))
  }
  return storePromise
}

function hmac(key: string, value: string): string {
  return createHmac('sha256', key).update(value).digest('base64url')
}

function querySignatures(query: string): string[] {
  const normalized = normalizeSearchQuery(query)
  if (!normalized) return []
  const terms = normalized.split(' ').filter(Boolean)
  return Array.from(
    new Set([
      normalized,
      ...terms,
      ...terms.flatMap((term) =>
        term.length >= 3 ? [term.slice(0, 3), term.slice(0, Math.min(5, term.length))] : []
      ),
    ])
  ).slice(0, 8)
}

async function hashesFor(identity: string, query: string): Promise<{
  resultHash: string
  queryHashes: string[]
} | null> {
  const key = await getLearningKey()
  if (!key) return null
  return {
    resultHash: hmac(key, `result:${identity}`),
    queryHashes: querySignatures(query).map((signature) => hmac(key, `query:${signature}`)),
  }
}

export async function personalizationBoost(identity: string, query: string): Promise<number> {
  const hashes = await hashesFor(identity, query)
  if (!hashes) return 0
  const store = await loadStore()
  const entry = store.entries.find((candidate) => candidate.resultHash === hashes.resultHash)
  if (!entry) return 0
  const age = Math.max(0, Date.now() - entry.lastSelectedAt)
  const decay = Math.pow(0.5, age / HALF_LIFE_MS)
  const queryMatch = hashes.queryHashes.some((hash) => entry.queryHashes.includes(hash))
  return Math.round(Math.min(35, (Math.log2(entry.count + 1) * 7 + (queryMatch ? 14 : 0)) * decay))
}

export async function recordCommandCenterSelection(identity: string, query: string): Promise<void> {
  const hashes = await hashesFor(identity, query)
  if (!hashes) return
  const store = await loadStore()
  const existing = store.entries.find((entry) => entry.resultHash === hashes.resultHash)
  if (existing) {
    existing.count += 1
    existing.lastSelectedAt = Date.now()
    existing.queryHashes = Array.from(new Set([...existing.queryHashes, ...hashes.queryHashes])).slice(-16)
  } else {
    store.entries.push({
      resultHash: hashes.resultHash,
      count: 1,
      lastSelectedAt: Date.now(),
      queryHashes: hashes.queryHashes,
    })
  }
  store.entries.sort((a, b) => b.lastSelectedAt - a.lastSelectedAt)
  store.entries = store.entries.slice(0, MAX_ENTRIES)
  await writeFileAtomic(STORE_FILE, JSON.stringify(store, null, 2)).catch(() => undefined)
}

export function clearCommandCenterSearchLearningCache(): void {
  keyPromise = null
  storePromise = null
}

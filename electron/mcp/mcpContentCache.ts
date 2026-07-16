interface CacheEntry<T> {
  value: T
  sizeBytes: number
}

export class McpContentCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>()

  constructor(
    private readonly maxEntries = 50,
    private readonly maxEntryBytes = 512 * 1024
  ) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.value
  }

  set(key: string, value: T): void {
    const sizeBytes = estimateSerializedBytes(value, this.maxEntryBytes)
    if (sizeBytes > this.maxEntryBytes) {
      this.entries.delete(key)
      return
    }
    this.entries.delete(key)
    this.entries.set(key, { value, sizeBytes })
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value
      if (typeof oldestKey !== 'string') break
      this.entries.delete(oldestKey)
    }
  }

  clearPrefix(prefix: string): void {
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) this.entries.delete(key)
    }
  }

  clear(): void {
    this.entries.clear()
  }
}

function estimateSerializedBytes(value: unknown, overflowValue: number): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8')
  } catch {
    return overflowValue + 1
  }
}

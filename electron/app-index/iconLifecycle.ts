const MAX_ICON_CACHE_ENTRIES = 128

export class AppIconLifecycle {
  private readonly cache = new Map<string, string>()
  private readonly failed = new Set<string>()
  private readonly requests = new Map<string, Promise<string | undefined>>()
  private readonly queue: Array<{ generation: number; start: () => void }> = []
  private activeJobs = 0
  private generation = 0
  private disposed = false

  constructor(
    private readonly concurrency: number,
    private readonly load: (iconKey: string) => Promise<string | undefined>
  ) {}

  peek(iconKey: string | undefined): string | undefined {
    return iconKey ? this.cache.get(iconKey) : undefined
  }

  isPending(iconKey: string | undefined): boolean {
    return Boolean(iconKey && this.requests.has(iconKey))
  }

  request(iconKey: string | undefined): string | undefined {
    if (!iconKey || this.disposed) return undefined
    const cached = this.cache.get(iconKey)
    if (cached) {
      this.setCacheEntry(iconKey, cached)
      return cached
    }
    if (this.failed.has(iconKey)) return undefined
    if (!this.requests.has(iconKey)) {
      const generation = this.generation
      const request = this.runJob(generation, () => this.load(iconKey))
        .then((data) => {
          if (this.disposed || generation !== this.generation) return undefined
          if (data) {
            this.failed.delete(iconKey)
            this.setCacheEntry(iconKey, data)
          } else {
            this.failed.add(iconKey)
          }
          return data
        })
        .catch(() => {
          if (!this.disposed && generation === this.generation) this.failed.add(iconKey)
          return undefined
        })
        .finally(() => {
          if (this.requests.get(iconKey) === request) this.requests.delete(iconKey)
        })
      this.requests.set(iconKey, request)
    }
    return undefined
  }

  clear(): void {
    this.generation += 1
    this.cache.clear()
    this.failed.clear()
    this.queue.length = 0
    this.requests.clear()
  }

  dispose(): void {
    this.disposed = true
    this.clear()
  }

  reset(): void {
    this.clear()
    this.disposed = false
  }

  private setCacheEntry(key: string, data: string): void {
    this.cache.delete(key)
    this.cache.set(key, data)
    while (this.cache.size > MAX_ICON_CACHE_ENTRIES) {
      const oldest = this.cache.keys().next().value
      if (typeof oldest !== 'string') break
      this.cache.delete(oldest)
    }
  }

  private runJob<T>(generation: number, job: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const start = () => {
        if (this.disposed || generation !== this.generation) {
          reject(new Error('Icon lifecycle was invalidated'))
          return
        }
        this.activeJobs += 1
        job()
          .then(resolve, reject)
          .finally(() => {
            this.activeJobs -= 1
            this.drain()
          })
      }
      if (this.activeJobs < this.concurrency) start()
      else this.queue.push({ generation, start })
    })
  }

  private drain(): void {
    while (this.activeJobs < this.concurrency) {
      const next = this.queue.shift()
      if (!next) return
      if (this.disposed || next.generation !== this.generation) continue
      next.start()
    }
  }
}

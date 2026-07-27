import fs from 'fs/promises'

import { writeFileAtomic } from '../utils/atomicFile'

export class AppIndexRepository<T> {
  constructor(
    private readonly filePath: () => string,
    private readonly maxBytes: number,
    private readonly sanitize: (value: unknown) => T | null
  ) {}

  async load(): Promise<T | null> {
    try {
      const stat = await fs.stat(this.filePath())
      if (stat.size > this.maxBytes) return null
      const raw = await fs.readFile(this.filePath(), 'utf-8')
      return this.sanitize(JSON.parse(raw))
    } catch {
      return null
    }
  }

  async save(snapshot: T): Promise<void> {
    await writeFileAtomic(this.filePath(), JSON.stringify(snapshot, null, 2))
  }
}

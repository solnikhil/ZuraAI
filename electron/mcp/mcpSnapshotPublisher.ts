export class McpSnapshotPublisher<T> {
  private readonly handlers = new Set<(snapshot: T) => void>()

  subscribe(handler: (snapshot: T) => void): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  publish(snapshot: T): void {
    for (const handler of this.handlers) handler(snapshot)
  }

  clear(): void {
    this.handlers.clear()
  }
}

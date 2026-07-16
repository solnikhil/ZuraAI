/** Serializes lifecycle/config transitions independently for each MCP server. */
export class McpTransitionQueue {
  private readonly tails = new Map<string, Promise<void>>()

  run<T>(serverId: string, transition: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(serverId) ?? Promise.resolve()
    const result = previous.then(transition, transition)
    const tail = result.then(
      () => undefined,
      () => undefined
    )
    this.tails.set(serverId, tail)
    void tail.finally(() => {
      if (this.tails.get(serverId) === tail) this.tails.delete(serverId)
    })
    return result
  }
}

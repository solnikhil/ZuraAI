export type Disposer = () => void

/** Owns registrations and releases them once, in reverse registration order. */
export class DisposableRegistry {
  private disposers: Disposer[] = []
  private disposed = false

  add(disposer: Disposer): void {
    if (this.disposed) {
      disposer()
      return
    }
    this.disposers.push(disposer)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    const errors: unknown[] = []
    for (const disposer of this.disposers.reverse()) {
      try {
        disposer()
      } catch (error) {
        errors.push(error)
      }
    }
    this.disposers = []
    if (errors.length > 0) {
      throw new AggregateError(errors, 'One or more main-process disposers failed.')
    }
  }
}

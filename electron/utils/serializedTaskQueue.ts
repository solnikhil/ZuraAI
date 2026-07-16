/**
 * Serializes stateful asynchronous work without allowing one rejected task to
 * poison the queue. Callers still receive the original task failure, while the
 * next task starts after that failure has settled.
 */
export class RecoverableSerializedTaskQueue {
  private tail: Promise<void> = Promise.resolve()

  run<T>(task: () => Promise<T> | T): Promise<T> {
    const result = this.tail.then(task, task)
    this.tail = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }
}

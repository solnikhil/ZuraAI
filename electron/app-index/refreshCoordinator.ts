export class AppIndexRefreshCoordinator {
  private generation = 0
  private disposed = false

  capture(): number {
    return this.generation
  }

  isCurrent(generation: number): boolean {
    return !this.disposed && generation === this.generation
  }

  isDisposed(): boolean {
    return this.disposed
  }

  dispose(): void {
    this.disposed = true
    this.generation += 1
  }

  reset(): void {
    this.generation += 1
    this.disposed = false
  }
}

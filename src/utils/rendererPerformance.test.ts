import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type EntryList = { getEntries: () => unknown[] }

class FakePerformanceObserver {
  static instances: FakePerformanceObserver[] = []

  observedType: string | null = null
  disconnected = false

  constructor(private readonly callback: (list: EntryList) => void) {
    FakePerformanceObserver.instances.push(this)
  }

  observe(options: { type: string; buffered?: boolean }): void {
    this.observedType = options.type
  }

  disconnect(): void {
    this.disconnected = true
  }

  takeRecords(): unknown[] {
    return []
  }

  emit(entries: unknown[]): void {
    this.callback({ getEntries: () => entries })
  }

  static reset(): void {
    FakePerformanceObserver.instances = []
  }

  static of(type: string): FakePerformanceObserver {
    const found = FakePerformanceObserver.instances.filter(
      (instance) => instance.observedType === type
    )
    if (found.length === 0) {
      throw new Error(`No observer registered for type: ${type}`)
    }
    return found[found.length - 1]
  }
}

/**
 * Builds a layout-shift entry that carries a realistically heavy `sources`
 * payload, mirroring the DOM node references a real LayoutShift holds.
 */
function layoutShift(startTime: number, value: number) {
  return {
    entryType: 'layout-shift',
    name: 'layout-shift',
    startTime,
    duration: 0,
    value,
    hadRecentInput: false,
    sources: [{ node: { tagName: 'DIV', payload: 'x'.repeat(256) } }],
  }
}

/** Own array-valued properties of the tracker, for retention assertions. */
function arrayFieldLengths(tracker: object): Record<string, number> {
  const lengths: Record<string, number> = {}
  for (const [key, value] of Object.entries(tracker)) {
    if (Array.isArray(value)) {
      lengths[key] = value.length
    }
  }
  return lengths
}

async function loadTracker() {
  vi.resetModules()
  const module = await import('./rendererPerformance')
  return module
}

describe('rendererPerformanceTracker', () => {
  let originalPerformanceObserver: unknown

  beforeEach(() => {
    FakePerformanceObserver.reset()
    originalPerformanceObserver = (globalThis as Record<string, unknown>).PerformanceObserver
    ;(globalThis as Record<string, unknown>).PerformanceObserver = FakePerformanceObserver
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    ;(globalThis as Record<string, unknown>).PerformanceObserver = originalPerformanceObserver
  })

  it('does not retain layout-shift entries across a long session', async () => {
    const { rendererPerformanceTracker } = await loadTracker()
    rendererPerformanceTracker.initialize()

    const cls = FakePerformanceObserver.of('layout-shift')
    const before = arrayFieldLengths(rendererPerformanceTracker)

    // Simulate hours of drift in a long-lived renderer.
    for (let index = 0; index < 20_000; index += 1) {
      cls.emit([layoutShift(index * 100, 0.001)])
    }

    const after = arrayFieldLengths(rendererPerformanceTracker)

    // No field may grow with the number of observed shifts.
    for (const [field, length] of Object.entries(after)) {
      expect(length, `field "${field}" grew to ${length} entries`).toBeLessThanOrEqual(
        (before[field] ?? 0) + 8
      )
    }

    // The metric itself still works.
    expect(rendererPerformanceTracker.getMetrics().cls).toBeGreaterThan(0)
  })

  it('reports the highest CLS session window rather than a lifetime sum', async () => {
    const { rendererPerformanceTracker } = await loadTracker()
    rendererPerformanceTracker.initialize()

    const cls = FakePerformanceObserver.of('layout-shift')

    // Window one: three shifts inside 1s of each other -> 0.30
    cls.emit([layoutShift(0, 0.1), layoutShift(500, 0.1), layoutShift(900, 0.1)])
    expect(rendererPerformanceTracker.getMetrics().cls).toBeCloseTo(0.3, 5)

    // A >1s gap starts a new window worth only 0.05, so the reported value
    // stays at the worst window instead of accumulating to 0.35.
    cls.emit([layoutShift(5000, 0.05)])
    expect(rendererPerformanceTracker.getMetrics().cls).toBeCloseTo(0.3, 5)

    // A worse later window replaces it.
    cls.emit([layoutShift(20_000, 0.4)])
    expect(rendererPerformanceTracker.getMetrics().cls).toBeCloseTo(0.4, 5)
  })

  it('ignores shifts that followed recent user input', async () => {
    const { rendererPerformanceTracker } = await loadTracker()
    rendererPerformanceTracker.initialize()

    FakePerformanceObserver.of('layout-shift').emit([
      { ...layoutShift(0, 0.5), hadRecentInput: true },
    ])

    expect(rendererPerformanceTracker.getMetrics().cls).toBe(0)
  })

  it('disconnects the long-task observer once TTI is final', async () => {
    const { rendererPerformanceTracker } = await loadTracker()
    rendererPerformanceTracker.initialize()

    const longTask = FakePerformanceObserver.of('longtask')
    expect(longTask.disconnected).toBe(false)

    // TTI only resolves once FCP is known.
    FakePerformanceObserver.of('paint').emit([
      { name: 'first-contentful-paint', startTime: 120, entryType: 'paint', duration: 0 },
    ])
    longTask.emit([{ startTime: 200, duration: 80, name: 'self', entryType: 'longtask' }])

    vi.advanceTimersByTime(5000)

    expect(rendererPerformanceTracker.getMetrics().tti).not.toBeNull()
    expect(longTask.disconnected).toBe(true)
  })

  it('disconnects single-valued FCP and FID observers after they report', async () => {
    const { rendererPerformanceTracker } = await loadTracker()
    rendererPerformanceTracker.initialize()

    const paint = FakePerformanceObserver.of('paint')
    paint.emit([{ name: 'first-contentful-paint', startTime: 90, entryType: 'paint', duration: 0 }])
    expect(paint.disconnected).toBe(true)

    const firstInput = FakePerformanceObserver.of('first-input')
    firstInput.emit([
      { name: 'pointerdown', startTime: 500, processingStart: 512, entryType: 'first-input' },
    ])
    expect(firstInput.disconnected).toBe(true)
    expect(rendererPerformanceTracker.getMetrics().fid).toBeCloseTo(12, 5)
  })

  it('cleans up every observer and listener when the document is discarded', async () => {
    const { rendererPerformanceTracker } = await loadTracker()
    rendererPerformanceTracker.initialize()

    expect(rendererPerformanceTracker.getActiveObserverCount()).toBeGreaterThan(0)

    window.dispatchEvent(new Event('pagehide'))

    expect(rendererPerformanceTracker.getActiveObserverCount()).toBe(0)
    for (const instance of FakePerformanceObserver.instances) {
      expect(instance.disconnected).toBe(true)
    }

    // The abort signal removed the listeners, so a second pagehide is inert and
    // re-initialising still works.
    window.dispatchEvent(new Event('pagehide'))
    rendererPerformanceTracker.initialize()
    expect(rendererPerformanceTracker.getActiveObserverCount()).toBeGreaterThan(0)
  })

  it('drops metric subscribers on cleanup so they cannot leak', async () => {
    const { rendererPerformanceTracker } = await loadTracker()
    rendererPerformanceTracker.initialize()

    const callback = vi.fn()
    rendererPerformanceTracker.onMetricsUpdate(callback)

    FakePerformanceObserver.of('layout-shift').emit([layoutShift(0, 0.05)])
    expect(callback).toHaveBeenCalledTimes(1)

    const cls = FakePerformanceObserver.of('layout-shift')
    rendererPerformanceTracker.cleanup()
    cls.emit([layoutShift(2000, 0.05)])

    expect(callback).toHaveBeenCalledTimes(1)
  })
})

import { rendererPerformanceTracker } from '@/utils/rendererPerformance'

type InteractionKind = 'click' | 'input' | 'key' | 'scroll' | 'route'

type InteractionEvent = {
  kind: InteractionKind
  label: string
  time: number
}

type ReactScanRenderEvent = {
  componentName: string
  count: number
  totalTime: number
  maxTime: number
  unnecessaryCount: number
  changeReasons: Set<string>
  time: number
}

type ReactScanRenderInput = {
  componentName: string | null
  time: number | null
  count: number
  unnecessary: boolean | null
  changes?: Array<{ type?: number; name?: string }>
}

const WINDOW_MS = 30_000
const MAX_EVENTS = 1600

const changeTypeLabels: Record<number, string> = {
  1: 'props',
  2: 'hook state',
  3: 'class state',
  4: 'context',
}

class PerformanceDiagnostics {
  private renderEvents: ReactScanRenderEvent[] = []
  private interactionEvents: InteractionEvent[] = []
  private initialized = false
  private lastScrollAt = 0
  private lastInputAt = 0
  private lastRoute = ''

  initialize(): void {
    if (this.initialized || typeof window === 'undefined') return
    this.initialized = true
    this.lastRoute = this.getRoute()
    this.recordInteraction('route', this.lastRoute)

    window.addEventListener('click', this.handleClick, true)
    window.addEventListener('input', this.handleInput, true)
    window.addEventListener('keydown', this.handleKeyDown, true)
    window.addEventListener('wheel', this.handleScroll, { capture: true, passive: true })
    window.addEventListener('hashchange', this.handleRouteChange)
    window.addEventListener('popstate', this.handleRouteChange)
  }

  recordReactScanRender(renders: ReactScanRenderInput[]): void {
    if (!import.meta.env.DEV || renders.length === 0) return

    const now = Date.now()
    for (const render of renders) {
      const componentName = render.componentName || 'Anonymous component'
      const changeReasons = new Set<string>()

      for (const change of render.changes ?? []) {
        if (typeof change.type === 'number') {
          changeReasons.add(changeTypeLabels[change.type] ?? `change:${change.type}`)
        }
      }

      this.renderEvents.push({
        componentName,
        count: Math.max(1, render.count || 1),
        totalTime: render.time ?? 0,
        maxTime: render.time ?? 0,
        unnecessaryCount: render.unnecessary ? 1 : 0,
        changeReasons,
        time: now,
      })
    }

    this.trim()
  }

  copyableReport(): string {
    this.trim()

    const metrics = rendererPerformanceTracker.getMetrics()
    const renderSummary = this.summarizeRenders()
    const recentInteractions = this.interactionEvents.slice(-12)
    const route = this.getRoute()
    const messageCount =
      typeof document === 'undefined' ? 0 : document.querySelectorAll('[data-message-id]').length
    const now = new Date()
    const longTasks = this.getRecentLongTasks()

    const lines = [
      '# ZuraAI Performance Snapshot',
      '',
      `Captured: ${now.toLocaleString()}`,
      `Window: ${this.getWindowLabel()}`,
      `Route: ${route}`,
      `DOM message nodes: ${messageCount}`,
      `Window: last ${Math.round(WINDOW_MS / 1000)}s`,
      '',
      '## Recent User Actions',
      ...this.formatInteractions(recentInteractions),
      '',
      '## Render Hotspots',
      ...this.formatRenderSummary(renderSummary),
      '',
      '## Browser Signals',
      `- FCP: ${formatMs(metrics.fcp)}`,
      `- LCP: ${formatMs(metrics.lcp)}`,
      `- FID: ${formatMs(metrics.fid)}`,
      `- CLS: ${metrics.cls === null ? 'N/A' : metrics.cls.toFixed(3)}`,
      `- Recent long tasks: ${longTasks.length}`,
      ...longTasks.slice(0, 5).map((task) => `  - ${task.duration.toFixed(0)}ms at +${task.startTime.toFixed(0)}ms`),
      '',
      '## Likely Lag Leads',
      ...this.formatLikelyCauses(renderSummary, longTasks.length),
      '',
      '## Notes For AI',
      '- This report is diagnostic evidence, not proof of root cause.',
      '- No prompt text, response text, clipboard content, file paths, or API keys are included.',
      '- High render count with unchanged or context-only changes usually points to parent/context invalidation.',
    ]

    return `${lines.join('\n')}\n`
  }

  private summarizeRenders() {
    const byComponent = new Map<
      string,
      {
        componentName: string
        renders: number
        events: number
        totalTime: number
        maxTime: number
        unnecessaryCount: number
        changeReasons: Set<string>
      }
    >()

    for (const event of this.renderEvents) {
      const existing =
        byComponent.get(event.componentName) ??
        {
          componentName: event.componentName,
          renders: 0,
          events: 0,
          totalTime: 0,
          maxTime: 0,
          unnecessaryCount: 0,
          changeReasons: new Set<string>(),
        }

      existing.renders += event.count
      existing.events += 1
      existing.totalTime += event.totalTime
      existing.maxTime = Math.max(existing.maxTime, event.maxTime)
      existing.unnecessaryCount += event.unnecessaryCount
      for (const reason of event.changeReasons) existing.changeReasons.add(reason)
      byComponent.set(event.componentName, existing)
    }

    return [...byComponent.values()]
      .sort((a, b) => b.renders - a.renders || b.totalTime - a.totalTime)
      .slice(0, 12)
  }

  private formatInteractions(events: InteractionEvent[]): string[] {
    if (events.length === 0) return ['- No interactions captured.']
    return events.map((event) => {
      const ageSeconds = Math.max(0, Math.round((Date.now() - event.time) / 1000))
      return `- ${ageSeconds}s ago: ${event.kind} -> ${event.label}`
    })
  }

  private formatRenderSummary(summary: ReturnType<PerformanceDiagnostics['summarizeRenders']>): string[] {
    if (summary.length === 0) return ['- No React Scan render events captured yet. Reproduce the lag, then copy again.']

    return summary.flatMap((item, index) => [
      `${index + 1}. ${item.componentName}`,
      `   renders: ${item.renders} across ${item.events} commits`,
      `   total observed render time: ${item.totalTime.toFixed(1)}ms`,
      `   slowest observed render: ${item.maxTime.toFixed(1)}ms`,
      `   unnecessary render signals: ${item.unnecessaryCount}`,
      `   change signals: ${formatSet(item.changeReasons)}`,
    ])
  }

  private formatLikelyCauses(
    summary: ReturnType<PerformanceDiagnostics['summarizeRenders']>,
    longTaskCount: number
  ): string[] {
    const leads: string[] = []
    const top = summary[0]
    const highRenderItems = summary.filter((item) => item.renders >= 30).slice(0, 3)
    const slowItems = summary.filter((item) => item.maxTime >= 16).slice(0, 3)
    const unnecessaryItems = summary.filter((item) => item.unnecessaryCount > 0).slice(0, 3)

    if (top) {
      leads.push(
        `- Highest render pressure is ${top.componentName} (${top.renders} renders). Start by checking what state/context changes reach it.`
      )
    }
    for (const item of highRenderItems) {
      leads.push(`- ${item.componentName} rendered frequently; memoization or narrower state ownership may help if props are stable.`)
    }
    for (const item of slowItems) {
      leads.push(`- ${item.componentName} crossed a frame budget (${item.maxTime.toFixed(1)}ms); inspect expensive render work inside it.`)
    }
    for (const item of unnecessaryItems) {
      leads.push(`- ${item.componentName} had unnecessary-render signals; check recreated props, callbacks, arrays, and context values.`)
    }
    if (longTaskCount > 0) {
      leads.push('- Browser long tasks were observed; lag may involve parsing, layout, markdown, diagrams, or synchronous work outside React renders.')
    }

    return leads.length > 0 ? [...new Set(leads)].slice(0, 8) : ['- Not enough evidence yet. Reproduce the slow interaction and copy again.']
  }

  private getRecentLongTasks(): PerformanceEntry[] {
    if (typeof performance === 'undefined') return []
    const cutoff = performance.now() - WINDOW_MS
    return performance
      .getEntriesByType('longtask')
      .filter((entry) => entry.startTime >= cutoff)
      .sort((a, b) => b.duration - a.duration)
  }

  private recordInteraction(kind: InteractionKind, label: string): void {
    this.interactionEvents.push({
      kind,
      label,
      time: Date.now(),
    })
    this.trim()
  }

  private handleClick = (event: Event) => {
    this.recordInteraction('click', describeTarget(event.target))
  }

  private handleInput = (event: Event) => {
    const now = Date.now()
    if (now - this.lastInputAt < 600) return
    this.lastInputAt = now
    this.recordInteraction('input', describeTarget(event.target))
  }

  private handleKeyDown = (event: KeyboardEvent) => {
    if (!event.key || event.key.length === 1) return
    this.recordInteraction('key', event.key)
  }

  private handleScroll = (event: Event) => {
    const now = Date.now()
    if (now - this.lastScrollAt < 900) return
    this.lastScrollAt = now
    this.recordInteraction('scroll', describeTarget(event.target))
  }

  private handleRouteChange = () => {
    const route = this.getRoute()
    if (route === this.lastRoute) return
    this.lastRoute = route
    this.recordInteraction('route', route)
  }

  private getRoute(): string {
    if (typeof window === 'undefined') return 'unknown'
    return `${window.location.pathname}${window.location.hash || ''}`
  }

  private getWindowLabel(): string {
    if (typeof window === 'undefined') return 'unknown'
    if (window.location.hash.includes('/command-center')) return 'command-center'
    if (window.location.hash.includes('/chat-debug')) return 'chat-debug'
    return 'main'
  }

  private trim(): void {
    const cutoff = Date.now() - WINDOW_MS
    this.renderEvents = this.renderEvents.filter((event) => event.time >= cutoff).slice(-MAX_EVENTS)
    this.interactionEvents = this.interactionEvents
      .filter((event) => event.time >= cutoff)
      .slice(-MAX_EVENTS)
  }
}

function describeTarget(target: EventTarget | null): string {
  if (!(target instanceof Element)) return 'unknown target'
  const button = target.closest('button,[role="button"],a,input,textarea,select,[data-message-id]')
  const element = button ?? target
  const tag = element.tagName.toLowerCase()
  const role = element.getAttribute('role')
  const aria = element.getAttribute('aria-label')
  const type = element.getAttribute('type')
  const dataSlot = element.getAttribute('data-slot')
  const className =
    typeof element.className === 'string'
      ? element.className
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .join('.')
      : ''

  return [tag, role ? `role=${role}` : null, type ? `type=${type}` : null, dataSlot ? `slot=${dataSlot}` : null, aria ? `label=${aria}` : null, className ? `.${className}` : null]
    .filter(Boolean)
    .join(' ')
}

function formatMs(value: number | null): string {
  return value === null ? 'N/A' : `${value.toFixed(0)}ms`
}

function formatSet(values: Set<string>): string {
  return values.size === 0 ? 'none reported' : [...values].join(', ')
}

export const performanceDiagnostics = new PerformanceDiagnostics()

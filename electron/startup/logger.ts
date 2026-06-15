/**
 * Structured, ANSI-colored logger for the Electron main process.
 *
 * - Production builds show info, warn, error levels only.
 * - Development builds also show debug-level output.
 * - Set ZURA_DEBUG=1 to force debug-level output in any environment.
 * - ANSI colors are automatically disabled when stdout is not a TTY
 *   (via picocolors.isColorSupported).
 * - Phase timing uses performance.now() for sub-millisecond precision.
 */

import pc from 'picocolors'
import { app } from 'electron'

type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug'

const LEVEL_NUM: Record<LogLevel, number> = {
  silent: -1,
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
}

const ICONS = {
  success: pc.green('✔'),
  error: pc.red('✖'),
  warn: pc.yellow('⚠'),
  info: pc.cyan('ℹ'),
  debug: pc.dim('→'),
} as const

type LogType = 'success' | 'error' | 'warn' | 'info' | 'debug'

const TYPE_LEVEL: Record<LogType, number> = {
  success: LEVEL_NUM.info,
  error: LEVEL_NUM.error,
  warn: LEVEL_NUM.warn,
  info: LEVEL_NUM.info,
  debug: LEVEL_NUM.debug,
}

const TYPE_METHOD: Record<LogType, 'log' | 'warn' | 'error'> = {
  success: 'log',
  error: 'error',
  warn: 'warn',
  info: 'log',
  debug: 'log',
}

function nowTimestamp(): string {
  const d = new Date()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

interface PhaseRecord {
  start: number
}

export interface TimingMetrics {
  processStartAt: number
  appReadyAt: number
  windowCreatedAt: number
  windowVisibleAt: number
  ipcReadyAt: number
  fullyLoadedAt: number
  phases: Record<string, { startedAt: number; completedAt: number; durationMs: number }>
}

export function createLogger(tag = 'zura', level?: LogLevel) {
  const isDev = !app?.isPackaged
  const isDebugEnv = process.env.ZURA_DEBUG === '1'
  const threshold = LEVEL_NUM[level ?? ((isDev || isDebugEnv) ? 'debug' : 'info')]
  const phases = new Map<string, PhaseRecord>()

  function format(type: LogType, msg: string): void {
    if (TYPE_LEVEL[type] > threshold) return
    const icon = ICONS[type]
    const ts = pc.dim(nowTimestamp())
    const prefix = pc.dim(pc.bold(`[${tag}]`))
    const method = TYPE_METHOD[type]
    console[method](`${ts} ${icon} ${prefix} ${msg}`)
  }

  return {
    info: (msg: string) => format('info', msg),
    success: (msg: string) => format('success', msg),
    warn: (msg: string) => format('warn', msg),
    error: (msg: string) => format('error', msg),
    debug: (msg: string) => format('debug', msg),

    withTag(childTag: string) {
      return createLogger(`${tag}/${childTag}`, level)
    },

    startPhase(label: string): void {
      phases.set(label, { start: performance.now() })
    },

    endPhase(label: string): void {
      const phase = phases.get(label)
      if (!phase) return
      const ms = Math.round(performance.now() - phase.start)
      phases.delete(label)
      const padded = pc.bold(label.padEnd(26))
      format('success', `${padded} ${pc.dim(`${ms}ms`)}`)
    },

    banner(version: string): void {
      const platform = `${process.platform}/${process.arch}`
      const electronVer = process.versions.electron ?? '?.?.?'
      const nodeVer = process.versions.node ?? '?.?.?'
      console.log()
      console.log(`  ${pc.bold(pc.cyan('ZuraAI'))} ${pc.dim(`v${version}`)}  ${pc.dim(platform)}`)
      console.log(`  ${pc.dim(`electron@${electronVer} · node@${nodeVer}`)}`)
      console.log()
    },

    timingSummary(metrics: TimingMetrics): void {
      const d = (a: number, b: number): string => {
        if (a > 0 && b > 0) return `${b - a}ms`
        return '—'
      }
      const m = metrics
      const divider = pc.dim('─'.repeat(50))

      console.log()
      console.log(`  ${divider} ${pc.bold('Startup timing')} ${divider}`)

      const rows: [string, string][] = [
        ['process → app ready', d(m.processStartAt, m.appReadyAt)],
        ['app ready → window', d(m.appReadyAt, m.windowCreatedAt)],
        ['window → visible', d(m.windowCreatedAt, m.windowVisibleAt)],
        ['process → IPC ready', d(m.processStartAt, m.ipcReadyAt)],
        ['time to visible', d(m.processStartAt, m.windowVisibleAt)],
        ['time to fully loaded', d(m.processStartAt, m.fullyLoadedAt)],
      ]

      const maxLabelLen = Math.max(...rows.map((r) => r[0].length))
      for (const [label, value] of rows) {
        console.log(`  ${pc.bold(label.padEnd(maxLabelLen))}  ${pc.dim(value)}`)
      }

      if (isDev || isDebugEnv) {
        const deferred = Object.entries(metrics.phases)
          .filter(([name]) => name.startsWith('deferred:'))
          .map(
            ([name, phase]) =>
              [name.replace('deferred:', ''), `${phase.durationMs}ms`] as [string, string]
          )

        if (deferred.length > 0) {
          console.log()
          const maxTaskLen = Math.max(...deferred.map((d) => d[0].length))
          for (const [task, ms] of deferred) {
            console.log(`  ${pc.dim('↳')} ${pc.bold(task.padEnd(maxTaskLen))}  ${pc.dim(ms)}`)
          }
        }
      }

      const readyMs =
        m.processStartAt > 0 && m.fullyLoadedAt > 0 ? m.fullyLoadedAt - m.processStartAt : null
      console.log()
      if (readyMs !== null) {
        console.log(`  ${ICONS.success} ${pc.bold('Ready')} ${pc.dim(`in ${readyMs}ms`)}`)
      } else {
        console.log(`  ${ICONS.success} ${pc.bold('Ready')}`)
      }
      console.log()
    },

    getPhaseMap(): Map<string, PhaseRecord> {
      return phases
    },
  }
}

export const log = createLogger('zura')
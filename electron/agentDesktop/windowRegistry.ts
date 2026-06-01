/**
 * Agent Desktop (Agent View) window registry.
 *
 * In-memory map of `Agent_Window` records keyed by native window handle (HWND).
 * Each record is tagged with the `Agent_Run` that launched it, its last-known
 * residence (`agent-desktop` | `user-desktop`), and the number of relocation
 * attempts made toward `MAX_PLACEMENT_ATTEMPTS`.
 *
 * This module owns the data structure behind `AgentDesktopSession.windows`. It
 * is intentionally side-effect free (no native calls, no I/O): the only mutable
 * state is the HWND map, and timestamps come from an injectable clock so timing
 * is deterministic in tests. The service layer drives the OS; this registry only
 * records associations and counters that downstream decisions read.
 *
 * Drives:
 * - Req 2.3 — window↔run association preserved across open/close operations.
 * - Req 2.5 — placement-failure threshold tracking (`MAX_PLACEMENT_ATTEMPTS`).
 * - Req 7.3 — `close_app` restricted to the current run's Agent_Windows.
 * - Req 1.5 / 1.6 — teardown decisions (remaining windows + non-agent windows).
 */

import { MAX_PLACEMENT_ATTEMPTS } from './constants'
import type { AgentWindowRecord, WindowResidence } from './types'

/** Input accepted by {@link WindowRegistry.register}. */
export interface RegisterWindowInput {
  /** Native window handle. */
  hwnd: number
  /** Window title at the time of association. */
  title: string
  /** Owning process id. */
  pid: number
  /** The Agent_Run that launched this window. Req 2.3. */
  agentRunId: string
  /**
   * Last-known residence. Defaults to `'user-desktop'`: a freshly observed
   * window is treated as not-yet-confirmed on the Agent_Desktop until placement
   * succeeds (fail-closed, Req 2.7).
   */
  residence?: WindowResidence
  /** When the window was first observed. Defaults to the registry clock. */
  openedAt?: number
}

/** Result of recording a single placement attempt. */
export interface PlacementAttemptResult {
  /** The cumulative number of relocation attempts recorded for the window. */
  attempts: number
  /**
   * True once `attempts` reaches `MAX_PLACEMENT_ATTEMPTS`. The service records a
   * placement-failure timeline step if and only if this becomes true (Req 2.5,
   * Property 9).
   */
  thresholdReached: boolean
}

/** Options for constructing a {@link WindowRegistry}. */
export interface WindowRegistryOptions {
  /** Injectable clock for `openedAt` timestamps. Defaults to `Date.now`. */
  now?: () => number
}

/**
 * In-memory registry of Agent_Windows keyed by HWND.
 *
 * The registry can hold windows from multiple Agent_Runs simultaneously; every
 * record carries its owning `agentRunId` so run-scoped queries (Req 7.3) and
 * teardown checks (Req 1.5 / 1.6) stay correct as windows open and close.
 */
export class WindowRegistry {
  private readonly windows = new Map<number, AgentWindowRecord>()
  private readonly now: () => number

  constructor(options: WindowRegistryOptions = {}) {
    this.now = options.now ?? Date.now
  }

  /**
   * Register (or replace) the record for an Agent_Window.
   *
   * If a record already exists for the HWND it is fully replaced — the OS can
   * recycle handles after a window closes, so a fresh registration represents a
   * new window and resets `placementAttempts` to zero.
   *
   * @returns The stored record.
   */
  register(input: RegisterWindowInput): AgentWindowRecord {
    const record: AgentWindowRecord = {
      hwnd: input.hwnd,
      title: input.title,
      pid: input.pid,
      agentRunId: input.agentRunId,
      residence: input.residence ?? 'user-desktop',
      placementAttempts: 0,
      openedAt: input.openedAt ?? this.now(),
    }
    this.windows.set(input.hwnd, record)
    return record
  }

  /**
   * Look up the record for an HWND.
   *
   * @returns The record, or `undefined` if the HWND is not registered.
   */
  get(hwnd: number): AgentWindowRecord | undefined {
    return this.windows.get(hwnd)
  }

  /** Alias for {@link WindowRegistry.get}. */
  lookup(hwnd: number): AgentWindowRecord | undefined {
    return this.windows.get(hwnd)
  }

  /** Whether the HWND is a known Agent_Window (any run). */
  isAgentWindow(hwnd: number): boolean {
    return this.windows.has(hwnd)
  }

  /**
   * Whether the HWND is an Agent_Window associated with the given run.
   *
   * Used to enforce the `close_app` targeting restriction (Req 7.3 / 7.4):
   * closure is only permitted for windows the current run actually opened.
   */
  isAgentWindowForRun(hwnd: number, agentRunId: string): boolean {
    const record = this.windows.get(hwnd)
    return record !== undefined && record.agentRunId === agentRunId
  }

  /**
   * Remove a window's record (e.g. when it is closed).
   *
   * @returns `true` if a record existed and was removed, otherwise `false`.
   */
  remove(hwnd: number): boolean {
    return this.windows.delete(hwnd)
  }

  /** Alias for {@link WindowRegistry.remove}. */
  close(hwnd: number): boolean {
    return this.windows.delete(hwnd)
  }

  /** All registered Agent_Windows, in insertion order. */
  getAll(): AgentWindowRecord[] {
    return Array.from(this.windows.values())
  }

  /** All Agent_Windows associated with a given run, in insertion order. */
  getByRun(agentRunId: string): AgentWindowRecord[] {
    const result: AgentWindowRecord[] = []
    for (const record of this.windows.values()) {
      if (record.agentRunId === agentRunId) {
        result.push(record)
      }
    }
    return result
  }

  /** Whether the run still has at least one live Agent_Window. */
  hasWindowsForRun(agentRunId: string): boolean {
    for (const record of this.windows.values()) {
      if (record.agentRunId === agentRunId) {
        return true
      }
    }
    return false
  }

  /** Remove every window associated with a run. Returns the number removed. */
  removeByRun(agentRunId: string): number {
    let removed = 0
    for (const [hwnd, record] of this.windows) {
      if (record.agentRunId === agentRunId) {
        this.windows.delete(hwnd)
        removed += 1
      }
    }
    return removed
  }

  /**
   * Record one relocation attempt for a window and report whether the failure
   * threshold has been reached.
   *
   * Increments `placementAttempts` and returns the cumulative count plus whether
   * it has reached `MAX_PLACEMENT_ATTEMPTS` (Req 2.5). Returns `undefined` when
   * the HWND is not registered, so callers do not act on a phantom window.
   */
  recordPlacementAttempt(hwnd: number): PlacementAttemptResult | undefined {
    const record = this.windows.get(hwnd)
    if (!record) {
      return undefined
    }
    record.placementAttempts += 1
    return {
      attempts: record.placementAttempts,
      thresholdReached: record.placementAttempts >= MAX_PLACEMENT_ATTEMPTS,
    }
  }

  /**
   * Reset the placement-attempt counter for a window (e.g. after a successful
   * placement confirms it on the Agent_Desktop).
   *
   * @returns `true` if the HWND is registered, otherwise `false`.
   */
  resetPlacementAttempts(hwnd: number): boolean {
    const record = this.windows.get(hwnd)
    if (!record) {
      return false
    }
    record.placementAttempts = 0
    return true
  }

  /**
   * Update the last-known residence of a window.
   *
   * @returns `true` if the HWND is registered, otherwise `false`.
   */
  updateResidence(hwnd: number, residence: WindowResidence): boolean {
    const record = this.windows.get(hwnd)
    if (!record) {
      return false
    }
    record.residence = residence
    return true
  }

  /** Number of registered Agent_Windows across all runs. */
  get size(): number {
    return this.windows.size
  }

  /** Whether the registry currently holds no Agent_Windows. */
  isEmpty(): boolean {
    return this.windows.size === 0
  }

  /**
   * Whether every HWND in `hwnds` is a registered Agent_Window.
   *
   * Supports ephemeral teardown (Req 1.6): the Agent_Desktop may only be removed
   * when it contains no windows ZuraAI did not place. An empty input list is
   * vacuously all-agent (`true`).
   */
  areAllAgentWindows(hwnds: readonly number[]): boolean {
    for (const hwnd of hwnds) {
      if (!this.windows.has(hwnd)) {
        return false
      }
    }
    return true
  }

  /**
   * Of the provided desktop window handles, return those that are NOT
   * registered Agent_Windows.
   *
   * Used to surface the "kept because it contains non-agent windows" notice
   * (Req 1.6) — a non-empty result means the Agent_Desktop must be retained.
   */
  getNonAgentWindows(hwnds: readonly number[]): number[] {
    return hwnds.filter((hwnd) => !this.windows.has(hwnd))
  }

  /** Remove all records (e.g. on session teardown or app quit). */
  clear(): void {
    this.windows.clear()
  }
}

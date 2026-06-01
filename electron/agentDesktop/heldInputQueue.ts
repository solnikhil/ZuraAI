/**
 * Agent Desktop (Agent View) held-input queue.
 *
 * Holds input actions (click / type / key / scroll / cursor_position) that
 * arrive while the Agent_Desktop is NOT the displayed Virtual_Desktop. Because
 * all Virtual_Desktops for a single Windows user share one Input_Session,
 * native input only reaches whichever desktop is currently displayed. So input
 * requested in the background is parked here instead of being delivered.
 *
 * Lifecycle (Req 3.6–3.8):
 * - On enqueue, each action is stamped with `expiresAt = now() + HELD_INPUT_TTL_MS`
 *   (60s) and held; it is NOT delivered while held (Req 3.6).
 * - On display switch, the queue releases the still-live held actions in
 *   first-in-first-out order so the caller can deliver them subject to the
 *   approval policy (Req 3.7).
 * - When the clock advances past an action's `expiresAt` without the
 *   Agent_Desktop becoming displayed, the action is discarded and surfaced so
 *   the caller can record an expiry outcome in the Agent_Run timeline (Req 3.8).
 *
 * This module owns only the pure timing/queueing logic. It performs no I/O and
 * delivers nothing itself — the caller (the service gate) decides what to do
 * with released vs expired actions. Timing is driven by an injectable clock so
 * the expiry behavior is deterministically testable.
 */

import { HELD_INPUT_TTL_MS } from './constants'
import type { AgentActionType } from './types'

/**
 * The descriptor a caller provides when parking an input action. Carries enough
 * to identify and later replay the action against the existing Computer Use
 * executor.
 */
export interface HeldInputInput {
  /** The input action type (click / type / key / scroll / cursor_position). */
  action: AgentActionType
  /** The raw action arguments to replay on release. */
  args: Record<string, unknown>
}

/**
 * A single parked input action. The queue assigns `id`, `requestedAt`, and
 * `expiresAt`; the caller supplies `action` and `args`.
 */
export interface HeldInputItem extends HeldInputInput {
  /** Stable per-queue identifier for this held action. */
  id: string
  /** Clock time at which the action was enqueued. */
  requestedAt: number
  /** Clock time at or after which the action is considered expired. */
  expiresAt: number
}

/**
 * Result of a display-switch release. `released` are the still-live actions in
 * FIFO order (deliver subject to approval policy, Req 3.7); `expired` are
 * actions that aged out at or before the switch and must be discarded with an
 * expiry outcome recorded (Req 3.8).
 */
export interface HeldInputReleaseResult {
  released: HeldInputItem[]
  expired: HeldInputItem[]
}

/** Injectable clock; defaults to `Date.now`. */
export interface HeldInputQueueOptions {
  now?: () => number
}

/**
 * FIFO queue of held input actions with deterministic, clock-driven expiry.
 *
 * Insertion order is preserved, so both release and expiry sweeps observe the
 * actions in the order they were requested.
 */
export class HeldInputQueue {
  private readonly now: () => number
  private readonly items: HeldInputItem[] = []
  private idCounter = 0

  constructor(options: HeldInputQueueOptions = {}) {
    this.now = options.now ?? Date.now
  }

  /** Number of actions currently held. */
  get size(): number {
    return this.items.length
  }

  /**
   * Park an input action while the Agent_Desktop is not displayed (Req 3.6).
   * Stamps the action with `expiresAt = now() + HELD_INPUT_TTL_MS` and returns
   * the stored item. The action is held, never delivered, by this call.
   */
  enqueue(input: HeldInputInput): HeldInputItem {
    const requestedAt = this.now()
    const item: HeldInputItem = {
      id: `held-${++this.idCounter}`,
      action: input.action,
      args: { ...input.args },
      requestedAt,
      expiresAt: requestedAt + HELD_INPUT_TTL_MS,
    }
    this.items.push(item)
    return item
  }

  /**
   * Non-mutating view of the held actions in FIFO order. Useful for status
   * indicators ("waiting for Take_Over") without releasing anything.
   */
  peek(): readonly HeldInputItem[] {
    return this.items.slice()
  }

  /**
   * Release the queue on a display switch (Req 3.7). Empties the queue and
   * partitions its contents by the current clock:
   * - `released`: still-live actions (`now() < expiresAt`) in FIFO order, to be
   *   delivered subject to the approval policy.
   * - `expired`: actions that aged out (`now() >= expiresAt`) at the moment of
   *   the switch; these are discarded and should be recorded as expiry outcomes
   *   (Req 3.8) rather than delivered.
   */
  release(): HeldInputReleaseResult {
    const now = this.now()
    const released: HeldInputItem[] = []
    const expired: HeldInputItem[] = []

    for (const item of this.items) {
      if (now >= item.expiresAt) {
        expired.push(item)
      } else {
        released.push(item)
      }
    }

    this.items.length = 0
    return { released, expired }
  }

  /**
   * Sweep for actions that have aged out without the Agent_Desktop becoming
   * displayed (Req 3.8). Removes and returns the expired actions (FIFO order) so
   * the caller can record an expiry outcome for each. Still-live actions remain
   * held in their original order.
   */
  purgeExpired(): HeldInputItem[] {
    const now = this.now()
    const expired: HeldInputItem[] = []

    for (let i = this.items.length - 1; i >= 0; i--) {
      if (now >= this.items[i].expiresAt) {
        expired.push(this.items[i])
        this.items.splice(i, 1)
      }
    }

    // Restore FIFO order (we scanned back-to-front while splicing).
    expired.reverse()
    return expired
  }

  /** Discard all held actions without releasing or recording them. */
  clear(): void {
    this.items.length = 0
  }
}

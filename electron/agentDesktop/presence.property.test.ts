/**
 * Property-Based Tests for the Agent Desktop presence state machine (pure).
 *
 * These tests exercise `permitsAction` / `isInputAction` from `presence.ts`
 * against the design's universal correctness properties:
 *
 * - Property 4: Session start and completion force background presence.
 *   `presence.ts` is pure and does not own session lifecycle; the session
 *   lifecycle (which sets Presence_Mode to `background` on start and on
 *   completion) lives in `service.ts` (see tasks 11.x). At the presence module
 *   the invariant that property reduces to is: while Presence_Mode is
 *   `background` (the mode forced at session start and completion), NO input
 *   action is ever delivered — every input action is held
 *   (`permit:false, hold:true, reason:'background-input'`) — while non-input
 *   actions remain permitted, regardless of the displayed state. So starting or
 *   completing a session (which forces `background`) means no input is
 *   delivered. The strongest presence-level property is implemented here.
 *
 * - Property 10: Presence governs input delivery.
 *
 * fast-check + Vitest, minimum 100 iterations per property.
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  isInputAction,
  permitsAction,
  NON_INPUT_ACTIONS,
  INPUT_ACTIONS,
  type PresenceMode,
} from './presence'
import type { AgentActionType } from './types'

// fast-check Arbitraries

/** Every action in the Computer Use surface that Agent Desktop reuses. */
const ALL_ACTIONS: readonly AgentActionType[] = [
  'screenshot',
  'click',
  'type',
  'key',
  'scroll',
  'cursor_position',
  'list_windows',
  'launch_app',
  'close_app',
  'find_app',
]

const actionArb: fc.Arbitrary<AgentActionType> = fc.constantFrom(...ALL_ACTIONS)
const inputActionArb: fc.Arbitrary<AgentActionType> = fc.constantFrom(...INPUT_ACTIONS)
const nonInputActionArb: fc.Arbitrary<AgentActionType> = fc.constantFrom(...NON_INPUT_ACTIONS)
const modeArb: fc.Arbitrary<PresenceMode> = fc.constantFrom('background', 'take-over')
const displayedArb: fc.Arbitrary<boolean> = fc.boolean()

const PBT_CONFIG = { numRuns: 100 }

// Feature: agent-desktop, Property 4: Session start and completion force background presence
describe('Property 4: Session start and completion force background presence', () => {
  it('holds every input action in background mode regardless of displayed state', () => {
    // Presence-level reduction: the mode forced at session start AND session
    // completion is `background`. In `background`, no input is ever delivered —
    // every input action is held (permit:false, hold:true, background-input).
    fc.assert(
      fc.property(inputActionArb, displayedArb, (action, displayed) => {
        const decision = permitsAction('background', displayed, action)

        expect(decision.permit).toBe(false)
        if (decision.permit === false) {
          expect(decision.reason).toBe('background-input')
          expect(decision.hold).toBe(true)
        }
      }),
      PBT_CONFIG
    )
  })

  it('permits every non-input action in background mode regardless of displayed state', () => {
    // Starting/completing a session forces background; non-input actions
    // (screenshot, list_windows, find_app) stay permitted so the agent can
    // continue staging/observing without delivering input.
    fc.assert(
      fc.property(nonInputActionArb, displayedArb, (action, displayed) => {
        const decision = permitsAction('background', displayed, action)
        expect(decision.permit).toBe(true)
      }),
      PBT_CONFIG
    )
  })

  it('delivers no input action in background mode for any action in the surface', () => {
    // The forced-background invariant restated over the whole action surface:
    // any action that IS an input action is never permitted in background.
    fc.assert(
      fc.property(actionArb, displayedArb, (action, displayed) => {
        const decision = permitsAction('background', displayed, action)
        if (isInputAction(action)) {
          expect(decision.permit).toBe(false)
        } else {
          expect(decision.permit).toBe(true)
        }
      }),
      PBT_CONFIG
    )
  })
})

// Feature: agent-desktop, Property 10: Presence governs input delivery
describe('Property 10: Presence governs input delivery', () => {
  it('permits an action iff it is non-input OR (take-over AND displayed)', () => {
    fc.assert(
      fc.property(modeArb, displayedArb, actionArb, (mode, displayed, action) => {
        const decision = permitsAction(mode, displayed, action)

        const expectedPermit =
          !isInputAction(action) || (mode === 'take-over' && displayed === true)

        expect(decision.permit).toBe(expectedPermit)
      }),
      PBT_CONFIG
    )
  })

  it('holds input in background with reason background-input', () => {
    fc.assert(
      fc.property(displayedArb, inputActionArb, (displayed, action) => {
        const decision = permitsAction('background', displayed, action)

        expect(decision.permit).toBe(false)
        if (decision.permit === false) {
          expect(decision.reason).toBe('background-input')
          expect(decision.hold).toBe(true)
        }
      }),
      PBT_CONFIG
    )
  })

  it('holds input in take-over while not displayed with reason not-displayed', () => {
    fc.assert(
      fc.property(inputActionArb, (action) => {
        const decision = permitsAction('take-over', false, action)

        expect(decision.permit).toBe(false)
        if (decision.permit === false) {
          expect(decision.reason).toBe('not-displayed')
          expect(decision.hold).toBe(true)
        }
      }),
      PBT_CONFIG
    )
  })

  it('delivers input only in take-over while displayed', () => {
    fc.assert(
      fc.property(inputActionArb, (action) => {
        const decision = permitsAction('take-over', true, action)
        expect(decision.permit).toBe(true)
      }),
      PBT_CONFIG
    )
  })

  it('always permits non-input actions regardless of mode and displayed state', () => {
    fc.assert(
      fc.property(modeArb, displayedArb, nonInputActionArb, (mode, displayed, action) => {
        const decision = permitsAction(mode, displayed, action)
        expect(decision.permit).toBe(true)
      }),
      PBT_CONFIG
    )
  })
})

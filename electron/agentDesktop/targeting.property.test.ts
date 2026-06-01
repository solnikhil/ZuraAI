/**
 * Property-based tests for Agent Desktop targeting / residence checks.
 *
 * These tests validate the fail-closed window-targeting guarantees of the pure
 * `targeting.ts` module across a wide range of generated inputs rather than a
 * few hand-picked examples. They are the property tests for Agent Desktop
 * design correctness properties 27, 28, and 29 (Req 2.7, 7.1–7.7).
 *
 * The module under test is pure (no I/O, no shared state, no clocks), so these
 * properties exercise the full decision surface deterministically:
 * - Input is delivered ONLY after positive Agent_Desktop residence confirmation.
 * - `close_app` (requireAgentWindow) is restricted to current-run Agent_Windows.
 * - Listed windows carry exactly one residence annotation.
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  canTargetWindow,
  classifyResidence,
  type TargetingContext,
} from './targeting'

/**
 * Shared property-test configuration. A stable seed keeps failures reproducible.
 * `numRuns` is held well above the required minimum of 100 since the module is
 * pure and each evaluation is cheap.
 */
const PROPERTY_TEST_CONFIG: fc.Parameters<unknown> = {
  numRuns: 200,
  seed: 0xa9d3,
}

/** Native window handles are positive integers in this domain. */
const hwndArb = fc.integer({ min: 1, max: 100_000 })

/** A small set of HWNDs (may be empty), modelling a handle collection. */
const handleSetArb = fc.array(hwndArb, { maxLength: 8 }).map((a) => new Set<number>(a))

/** Residence-confirmation tri-state: confirmed-on-agent / confirmed-on-user / unconfirmed. */
const onAgentDesktopArb = fc.constantFrom<boolean | undefined>(true, false, undefined)

/**
 * A full targeting scenario: a context plus a target HWND. The target is biased
 * toward membership in the context's handle sets (so the `zura-owned` and
 * `agent-window` branches are exercised) while still including fresh handles
 * that fall outside every set.
 */
const scenarioArb: fc.Arbitrary<{ ctx: TargetingContext; hwnd: number }> = fc
  .record({
    agentDesktopIndex: fc.integer({ min: 0, max: 10 }),
    agentWindowHandles: handleSetArb,
    zuraOwnedHandles: handleSetArb,
  })
  .chain((ctx) => {
    const candidates = [...ctx.agentWindowHandles, ...ctx.zuraOwnedHandles]
    const targetArb =
      candidates.length > 0 ? fc.oneof(fc.constantFrom(...candidates), hwndArb) : hwndArb
    return fc.record({ ctx: fc.constant(ctx), hwnd: targetArb })
  })

describe('targeting (property-based)', () => {
  // Feature: agent-desktop, Property 27: Input delivered only after positive Agent_Desktop residence confirmation
  //
  // For any window targeted by an action, input is delivered only when the target window's residence
  // is positively confirmed as `agent-desktop`; if the target resides on the User_Desktop, is a
  // ZuraAI-owned window, or residence cannot be positively confirmed, the action is rejected, no input
  // is delivered, and a targeting-violation entry identifying the affected window is recorded.
  //
  // **Validates: Requirements 2.7, 7.1, 7.2, 7.6, 7.7**
  it('Property 27: input is delivered only after positive Agent_Desktop residence confirmation', () => {
    fc.assert(
      fc.property(scenarioArb, onAgentDesktopArb, ({ ctx, hwnd }, onAgentDesktop) => {
        // requireAgentWindow defaults to false here so this property isolates the
        // residence-confirmation semantics (Req 7.1/7.2/7.6/7.7) from the
        // close_app agent-window restriction (covered by Property 28).
        const decision = canTargetWindow(hwnd, ctx, onAgentDesktop)
        const isZuraOwned = ctx.zuraOwnedHandles.has(hwnd)

        // Exact fail-closed outcome, in the documented precedence order.
        if (isZuraOwned) {
          // ZuraAI-owned windows are always rejected regardless of residence (Req 7.6).
          expect(decision).toEqual({ allow: false, reason: 'zura-owned' })
        } else if (onAgentDesktop === undefined) {
          // Residence not positively confirmed ⇒ rejected (Req 7.1, 7.7, 2.7).
          expect(decision).toEqual({ allow: false, reason: 'unconfirmed' })
        } else if (onAgentDesktop === false) {
          // Confirmed on the User_Desktop ⇒ rejected (Req 7.2).
          expect(decision).toEqual({ allow: false, reason: 'user-desktop' })
        } else {
          // Positively confirmed on the Agent_Desktop and not ZuraAI-owned ⇒ allowed.
          expect(decision).toEqual({ allow: true })
        }

        // Overarching invariant: an action is allowed if and only if the target is
        // not ZuraAI-owned AND its Agent_Desktop residence is positively confirmed.
        expect(decision.allow).toBe(!isZuraOwned && onAgentDesktop === true)
      }),
      PROPERTY_TEST_CONFIG
    )
  })

  // Feature: agent-desktop, Property 28: close_app is restricted to current-run Agent_Windows
  //
  // For any `close_app` target, the closure is permitted if and only if the target is an Agent_Window
  // associated with the current Agent_Run; otherwise the request is rejected, the target window is left
  // unchanged, and a targeting-violation entry identifying the window is recorded.
  //
  // **Validates: Requirements 7.3, 7.4**
  it('Property 28: close_app is permitted iff the target is a current-run Agent_Window', () => {
    // Scenario generator for the agent-window restriction: residence is positively
    // confirmed on the Agent_Desktop and the target is guaranteed NOT to be
    // ZuraAI-owned, so the only remaining gate is the current-run Agent_Window
    // membership check that `requireAgentWindow` (close_app) enforces.
    const scenario28Arb = fc
      .record({
        agentDesktopIndex: fc.integer({ min: 0, max: 10 }),
        agentWindowHandles: handleSetArb,
        zuraOwnedHandles: handleSetArb,
      })
      .chain((base) => {
        const candidates = [...base.agentWindowHandles]
        const targetArb =
          candidates.length > 0 ? fc.oneof(fc.constantFrom(...candidates), hwndArb) : hwndArb
        return targetArb.map((hwnd) => {
          // Remove the target from the ZuraAI-owned set so the zura-owned branch
          // (validated by Property 27) does not pre-empt the agent-window check.
          const zuraOwnedHandles = new Set(
            [...base.zuraOwnedHandles].filter((h) => h !== hwnd)
          )
          const ctx: TargetingContext = {
            agentDesktopIndex: base.agentDesktopIndex,
            agentWindowHandles: base.agentWindowHandles,
            zuraOwnedHandles,
          }
          return { ctx, hwnd }
        })
      })

    fc.assert(
      fc.property(scenario28Arb, ({ ctx, hwnd }) => {
        // requireAgentWindow=true models close_app and other agent-window-restricted actions.
        const decision = canTargetWindow(hwnd, ctx, true, true)
        const isAgentWindow = ctx.agentWindowHandles.has(hwnd)

        if (isAgentWindow) {
          // A current-run Agent_Window on the confirmed Agent_Desktop ⇒ allowed (Req 7.3).
          expect(decision).toEqual({ allow: true })
        } else {
          // Not a current-run Agent_Window ⇒ rejected, target left unchanged (Req 7.4).
          expect(decision).toEqual({ allow: false, reason: 'not-agent-window' })
        }

        // close_app is permitted if and only if the target is a current-run Agent_Window.
        expect(decision.allow).toBe(isAgentWindow)
      }),
      PROPERTY_TEST_CONFIG
    )
  })

  // Feature: agent-desktop, Property 29: Listed windows carry exactly one residence annotation
  //
  // For any window list produced during an agent task, every entry is annotated with a residence
  // attribute equal to exactly one of `agent-desktop` or `user-desktop`.
  //
  // **Validates: Requirements 7.5**
  it('Property 29: classifyResidence returns exactly one annotation, agent-desktop iff onAgentDesktop', () => {
    fc.assert(
      fc.property(hwndArb, fc.boolean(), (hwnd, onAgentDesktop) => {
        const residence = classifyResidence(hwnd, onAgentDesktop)

        // The annotation is exactly one of the two valid residence values.
        expect(['agent-desktop', 'user-desktop']).toContain(residence)

        // It is `agent-desktop` if and only if the window is on the Agent_Desktop,
        // and `user-desktop` otherwise — a total, mutually-exclusive classification.
        expect(residence === 'agent-desktop').toBe(onAgentDesktop === true)
        expect(residence === 'user-desktop').toBe(onAgentDesktop === false)
      }),
      PROPERTY_TEST_CONFIG
    )
  })
})

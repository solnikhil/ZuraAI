// @vitest-environment node

// Feature: agent-desktop, Property 36: Enabling requires disclosure acknowledgement

/**
 * Property-based tests for disclosure-gated enablement of the Agent Desktop
 * skill (Task 13.11).
 *
 * **Property 36: Enabling requires disclosure acknowledgement**
 * **Validates: Requirements 12.1, 12.2**
 *
 * The skill cannot become *effectively enabled* unless the not-a-sandbox
 * disclosure has been acknowledged; without acknowledgement, no Agent_Desktop
 * capability is enabled (Req 12.1, 12.2). Concretely, this file exercises the
 * already-implemented `AgentDesktopService.applySettings` / `acknowledgeDisclosure`
 * paths (in `service.ts`) as a black box and asserts three facets of the
 * property across 100+ generated input sequences:
 *
 *  1. **Core invariant (Req 12.2).** Across any interleaving of mirrored
 *     settings payloads and disclosure acknowledgements, the resulting state is
 *     `enabled: true` *only when* `disclosureAcknowledged: true`. Equivalently,
 *     the skill is never enabled without acknowledgement, and an enabled skill
 *     always reports an `available`/`active` capability while a non-enabled one
 *     reports `unavailable` (no capability is enabled). Acknowledgement is
 *     sticky: once recorded it is never silently revoked by a later payload.
 *
 *  2. **Decline/dismiss keeps everything off (Req 12.1, 12.2).** When the user
 *     attempts to enable the skill *without* acknowledging the disclosure, the
 *     skill stays disabled, the capability stays `unavailable`, and the
 *     Computer Use action gate rejects every requested action — i.e. no
 *     Agent_Desktop capability is exposed.
 *
 *  3. **Acknowledgement unlocks enabling (Req 12.1, 12.2).** Once the disclosure
 *     is acknowledged (either by an explicit `acknowledgeDisclosure()` call or by
 *     a mirrored payload carrying `disclosureAcknowledged: true`), an enable
 *     payload takes effect and the capability becomes `available`.
 *
 * ## Test strategy
 * The native VDA binding is fully injected through
 * {@link AgentDesktopServiceOptions.binding} (an in-memory mock that loads as
 * `available`), and `platformSupported` is forced `true`, so the *only* gate on
 * enablement under test is the disclosure acknowledgement — never a real DLL,
 * `koffi`, nut.js, or `desktopCapturer`. A model mirrors the service's sticky
 * acknowledgement + force-disabled-without-acknowledgement rules so the expected
 * `enabled` / `disclosureAcknowledged` outcome can be predicted for every
 * generated operation and compared against the observed state.
 */

import { describe, it, expect, vi } from 'vitest'
import * as fc from 'fast-check'

import { createAgentDesktopService, type AgentDesktopService } from './service'
import type { VdaBinding, VdaWindowInfo } from './vdaBinding'
import type { VdaLoadOutcome } from './types'

/**
 * Shared property-test configuration. A stable seed keeps any failure
 * reproducible and `numRuns` comfortably exceeds the spec's minimum of 100.
 */
const PROPERTY_TEST_CONFIG = { numRuns: 200, seed: 0x36d9 }

/**
 * A fully-mocked {@link VdaBinding} whose `load()` resolves to `available` so
 * `initialize()` records `vdaOutcome: 'available'` and the disclosure/skill gate
 * is the only thing standing between the user and an enabled capability. Every
 * OS-driving method is a harmless spy — the disclosure-gating paths never touch
 * them.
 */
function makeAvailableBinding(): VdaBinding & { getLoadError: () => string | null } {
  let available = false
  return {
    load: vi.fn(async (): Promise<VdaLoadOutcome> => {
      available = true
      return 'available'
    }),
    isAvailable: vi.fn(() => available),
    getLoadError: vi.fn(() => null),
    getCurrentDesktopIndex: vi.fn(() => 0),
    getDesktopCount: vi.fn(() => 1),
    createDesktop: vi.fn(() => 1),
    removeDesktop: vi.fn(),
    goToDesktop: vi.fn(),
    desktopExists: vi.fn(() => true),
    moveWindowToDesktop: vi.fn(),
    isWindowOnDesktop: vi.fn(() => true),
    enumerateWindows: vi.fn((): VdaWindowInfo[] => []),
    dispose: vi.fn(),
  }
}

/**
 * Create a fresh, initialized service on the safe disabled default (skill
 * disabled, disclosure NOT acknowledged) over an `available` mock VDA. This is
 * the canonical starting point for the property: nothing is enabled and the
 * disclosure has not yet been acknowledged.
 */
async function makeFreshService(): Promise<AgentDesktopService> {
  const service = createAgentDesktopService({
    binding: makeAvailableBinding(),
    platformSupported: true,
  })
  await service.initialize()
  return service
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** A boolean that may also be omitted entirely from the mirrored payload. */
const optionalBooleanArb = fc.option(fc.boolean(), { nil: undefined })

/**
 * A mirrored-settings payload as it would arrive over `agent-desktop:apply-settings`.
 * All keys are optional so the generator covers omitted `enabled` (normalizes to
 * `false`), omitted `disclosureAcknowledged` (does not acknowledge), and arbitrary
 * combinations of the other persisted fields. Always a plain object, so it is
 * always a *usable* record (the retain-on-failure path for non-objects is covered
 * by `service.applySettings.test.ts`).
 */
const settingsPayloadArb = fc.record(
  {
    enabled: fc.boolean(),
    disclosureAcknowledged: optionalBooleanArb,
    persistence: fc.constantFrom('persist', 'ephemeral', 'bogus', undefined),
    approvalTimeoutMs: fc.option(fc.integer({ min: 0, max: 1_000_000 }), { nil: undefined }),
  },
  { requiredKeys: [] }
)

/** An operation applied to the service: acknowledge the disclosure, or mirror a payload. */
type Op =
  | { kind: 'acknowledge' }
  | { kind: 'apply'; payload: Record<string, unknown> }

const opArb: fc.Arbitrary<Op> = fc.oneof(
  { weight: 1, arbitrary: fc.constant<Op>({ kind: 'acknowledge' }) },
  {
    weight: 3,
    arbitrary: settingsPayloadArb.map((payload): Op => ({ kind: 'apply', payload })),
  }
)

/**
 * The 10 Computer Use action types plus a few out-of-surface names. Used to
 * confirm the gate rejects *every* requested action while the skill is not
 * enabled (no capability is exposed), regardless of action name.
 */
const actionArb = fc.constantFrom(
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
  'delete_file',
  'run_shell',
  ''
)

/**
 * The model's prediction of the sticky acknowledgement after applying a payload.
 * Mirrors `service.ts`: a prior acknowledgement is preserved, and an incoming
 * `disclosureAcknowledged === true` records it (anything else leaves it as-is).
 */
function predictAck(priorAck: boolean, payload: Record<string, unknown>): boolean {
  return priorAck || payload.disclosureAcknowledged === true
}

/**
 * The model's prediction of effective `enabled` after applying a payload.
 * Mirrors `service.ts`: the skill is enabled only when the payload requests it
 * AND the (post-update, sticky) disclosure acknowledgement is in place.
 */
function predictEnabled(payload: Record<string, unknown>, ackAfter: boolean): boolean {
  return payload.enabled === true && ackAfter
}

// ---------------------------------------------------------------------------
// Property 36 — Facet 1: core invariant across arbitrary operation sequences
// ---------------------------------------------------------------------------

describe('AgentDesktopService disclosure gate — Property 36: enabling requires acknowledgement', () => {
  // Feature: agent-desktop, Property 36: Enabling requires disclosure acknowledgement
  // Validates: Requirements 12.1, 12.2
  it('never reports enabled without acknowledgement across any sequence of settings/acknowledge ops', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(opArb, { minLength: 1, maxLength: 40 }),
        async (ops) => {
          const service = await makeFreshService()

          // Model mirror of the service's sticky-ack + force-disable rules.
          let modelAck = false
          let modelEnabled = false

          // Fresh service starts disabled + unacknowledged.
          const initial = service.getState()
          expect(initial.enabled).toBe(false)
          expect(initial.disclosureAcknowledged).toBe(false)
          expect(initial.capability).toBe('unavailable')

          for (const op of ops) {
            if (op.kind === 'acknowledge') {
              service.acknowledgeDisclosure()
              // Acknowledgement records the flag but never enables on its own.
              modelAck = true
            } else {
              service.applySettings(op.payload)
              modelAck = predictAck(modelAck, op.payload)
              modelEnabled = predictEnabled(op.payload, modelAck)
            }

            const state = service.getState()

            // Observed state matches the model exactly.
            expect(state.disclosureAcknowledged).toBe(modelAck)
            expect(state.enabled).toBe(modelEnabled)

            // CORE INVARIANT (Req 12.2): enabled implies acknowledged.
            if (state.enabled) {
              expect(state.disclosureAcknowledged).toBe(true)
            }

            // Capability consistency: an enabled skill exposes a usable
            // capability; a non-enabled skill exposes none (Req 12.2). No session
            // is provisioned in this test, so an enabled skill resolves to
            // 'available' rather than 'active'.
            if (state.enabled) {
              expect(state.capability).toBe('available')
            } else {
              expect(state.capability).toBe('unavailable')
            }
          }
        }
      ),
      PROPERTY_TEST_CONFIG
    )
  })

  // ---------------------------------------------------------------------------
  // Property 36 — Facet 2: decline/dismiss keeps the skill and capability off
  // ---------------------------------------------------------------------------

  // Feature: agent-desktop, Property 36: Enabling requires disclosure acknowledgement
  // Validates: Requirements 12.1, 12.2
  it('keeps the skill disabled and rejects every gated action when enabling without acknowledgement', async () => {
    await fc.assert(
      fc.asyncProperty(
        // An enable attempt that does NOT acknowledge: enabled requested true,
        // disclosureAcknowledged either omitted or explicitly false.
        fc.record(
          {
            enabled: fc.constant(true),
            disclosureAcknowledged: fc.constantFrom(undefined, false),
            persistence: fc.constantFrom('persist', 'ephemeral', undefined),
          },
          { requiredKeys: ['enabled'] }
        ),
        actionArb,
        async (payload, action) => {
          const service = await makeFreshService()

          // Attempt to enable without acknowledging the disclosure.
          const state = service.applySettings(payload)

          // The skill stays disabled and no capability is enabled (Req 12.1, 12.2).
          expect(state.disclosureAcknowledged).toBe(false)
          expect(state.enabled).toBe(false)
          expect(state.capability).toBe('unavailable')

          // The Computer Use action gate exposes nothing: every action is rejected
          // without driving the OS, regardless of action name.
          const decision = await service.gateComputerAction({ action, args: {} })
          expect(decision.allow).toBe(false)
        }
      ),
      PROPERTY_TEST_CONFIG
    )
  })

  // ---------------------------------------------------------------------------
  // Property 36 — Facet 3: acknowledgement unlocks enabling (both routes)
  // ---------------------------------------------------------------------------

  // Feature: agent-desktop, Property 36: Enabling requires disclosure acknowledgement
  // Validates: Requirements 12.1, 12.2
  it('enables the skill once the disclosure is acknowledged, via either acknowledgement route', async () => {
    await fc.assert(
      fc.asyncProperty(
        // route = how the disclosure becomes acknowledged before enabling.
        fc.constantFrom<'explicit-call' | 'payload-flag'>('explicit-call', 'payload-flag'),
        fc.constantFrom('persist', 'ephemeral'),
        async (route, persistence) => {
          const service = await makeFreshService()

          // Pre-acknowledgement: an enable attempt is gated off.
          const gated = service.applySettings({ enabled: true })
          expect(gated.enabled).toBe(false)
          expect(gated.capability).toBe('unavailable')

          let enabledState: ReturnType<AgentDesktopService['getState']>
          if (route === 'explicit-call') {
            // Acknowledge out-of-band, then a plain enable payload takes effect.
            service.acknowledgeDisclosure()
            enabledState = service.applySettings({ enabled: true, persistence })
          } else {
            // The mirrored payload itself carries the acknowledgement.
            enabledState = service.applySettings({
              enabled: true,
              disclosureAcknowledged: true,
              persistence,
            })
          }

          // Acknowledgement unlocks enabling; the capability becomes available
          // (no session active ⇒ 'available', not 'active') (Req 12.1, 12.2).
          expect(enabledState.disclosureAcknowledged).toBe(true)
          expect(enabledState.enabled).toBe(true)
          expect(enabledState.capability).toBe('available')

          // Acknowledgement is sticky: a later payload that omits the flag does
          // not revoke it, and the skill stays enabled.
          const later = service.applySettings({ enabled: true, persistence })
          expect(later.disclosureAcknowledged).toBe(true)
          expect(later.enabled).toBe(true)
        }
      ),
      PROPERTY_TEST_CONFIG
    )
  })
})

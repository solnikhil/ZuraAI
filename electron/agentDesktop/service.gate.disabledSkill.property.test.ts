// @vitest-environment node

/**
 * Property-based test for Agent Desktop disabled-skill behavior (Task 13.10).
 *
 * Covered correctness property (from the design):
 * - Property 35: Disabled skill neither exposes actions nor provisions
 *   (Req 10.9, 10.10).
 *
 * This property lives in its own dedicated file (separate from the other Task 13
 * gate property tests) so the parallel test-authoring tasks never collide on a
 * shared file.
 *
 * ## What "disabled skill" means here
 * Requirement 10.9: WHILE the Agent_Desktop_Skill is disabled, the system SHALL
 * NOT expose Agent_Desktop actions to the agent. At the service level the gate
 * (`gateComputerAction`) is the surface that "exposes" actions — an action is
 * exposed/permitted only when the gate returns `{ allow: true }`. While the
 * skill is disabled the gate must reject EVERY action with `{ allow: false }`,
 * never increment the shared action counter, and never drive any OS / native
 * desktop operation.
 *
 * Requirement 10.10: WHILE the Agent_Desktop_Skill is disabled, the system SHALL
 * NOT provision an Agent_Desktop. `startSession` must therefore return
 * `{ provisioned: false }` and never call any native binding method that would
 * create, switch, or otherwise touch a Virtual_Desktop.
 *
 * ## Test strategy
 * The disabled-skill rejection is the THIRD availability gate, after platform
 * support and VDA availability. To isolate the disabled skill as the sole cause
 * of rejection (and prove it is not platform / VDA gating doing the work), every
 * scenario keeps the platform supported AND the VDA binding `available`, and
 * varies only `settings.enabled = false` (plus arbitrary disclosure state). The
 * rejection reason is asserted to name the disabled skill so the test fails if
 * some other gate starts short-circuiting first.
 *
 * A fully-controllable in-memory {@link VdaBinding} records every native call
 * other than `load` / `isAvailable` / `getLoadError` / `dispose` (the only calls
 * legitimately made during `initialize()` and the availability probe), so the
 * "drives no OS operation" invariant is observable directly: while disabled that
 * recorded count must stay 0 across 100+ generated inputs.
 *
 * A positive-control test (skill enabled) proves the property is not vacuous: the
 * exact same gate inputs are permitted and `startSession` provisions once the
 * skill is enabled.
 *
 * Native side-effects (the VDA binding) are fully injected/mocked; the service's
 * injectable clock is left at its default since this property does not exercise
 * timing logic. All property tests run with at least 100 iterations.
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

import {
  createAgentDesktopService,
  type AgentDesktopService,
  type GateInput,
} from './service'
import type { VdaBinding, VdaWindowInfo } from './vdaBinding'
import type { VdaLoadOutcome, AgentDesktopSession } from './types'
import { defaultAgentDesktopSettings, type AgentDesktopSettings } from './settings'

/**
 * Shared property-test configuration. A stable seed keeps any failure
 * reproducible and `numRuns` comfortably satisfies the spec's minimum of 100.
 */
const PROPERTY_TEST_CONFIG = { numRuns: 200, seed: 0x350a }

/** Index handed out by the first {@link MockVdaBinding.createDesktop} call. */
const FIRST_CREATED_INDEX = 100

/** The 10 Computer Use action names Agent Desktop reuses (Req 4.1). */
const CU_ACTION_NAMES = [
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
] as const

/**
 * A fully-controllable in-memory {@link VdaBinding}.
 *
 * `load()` reports `available` so the disabled-skill gate (not VDA gating) is
 * the cause of every rejection. Every native method other than `load` /
 * `isAvailable` / `getLoadError` / `dispose` increments {@link nativeCalls}, so a
 * test can assert that a disabled skill drives zero desktop operations.
 */
class MockVdaBinding implements VdaBinding {
  private available = false
  private existing = new Set<number>([0])
  private current = 0
  private nextIndex = FIRST_CREATED_INDEX

  // --- Observable call records ---------------------------------------------
  /** Count of every OS-touching native call (excludes load/isAvailable/dispose). */
  nativeCalls = 0
  createDesktopCalls = 0
  removeDesktopCalls: number[] = []
  goToDesktopCalls: number[] = []
  lastCreatedIndex: number | null = null

  async load(): Promise<VdaLoadOutcome> {
    this.available = true
    return 'available'
  }

  isAvailable(): boolean {
    return this.available
  }

  /** Read defensively by the service; no load error in the available path. */
  getLoadError(): string | null {
    return null
  }

  getCurrentDesktopIndex(): number {
    this.nativeCalls += 1
    return this.current
  }

  getDesktopCount(): number {
    this.nativeCalls += 1
    return this.existing.size
  }

  createDesktop(): number {
    this.nativeCalls += 1
    const index = this.nextIndex++
    this.existing.add(index)
    this.createDesktopCalls += 1
    this.lastCreatedIndex = index
    return index
  }

  removeDesktop(index: number): void {
    this.nativeCalls += 1
    this.existing.delete(index)
    this.removeDesktopCalls.push(index)
  }

  goToDesktop(index: number): void {
    this.nativeCalls += 1
    this.current = index
    this.goToDesktopCalls.push(index)
  }

  desktopExists(index: number): boolean {
    this.nativeCalls += 1
    return this.existing.has(index)
  }

  moveWindowToDesktop(): void {
    this.nativeCalls += 1
  }

  isWindowOnDesktop(): boolean {
    this.nativeCalls += 1
    return true
  }

  enumerateWindows(): VdaWindowInfo[] {
    this.nativeCalls += 1
    return []
  }

  dispose(): void {
    this.available = false
  }
}

/** Disabled Agent Desktop settings with the requested disclosure state. */
function disabledSettings(disclosureAcknowledged: boolean): AgentDesktopSettings {
  return {
    ...defaultAgentDesktopSettings,
    approvalPolicy: { ...defaultAgentDesktopSettings.approvalPolicy },
    enabled: false,
    disclosureAcknowledged,
  }
}

/** Enabled Agent Desktop settings (disclosure acknowledged) for the positive control. */
function enabledSettings(): AgentDesktopSettings {
  return {
    ...defaultAgentDesktopSettings,
    approvalPolicy: { ...defaultAgentDesktopSettings.approvalPolicy },
    enabled: true,
    disclosureAcknowledged: true,
  }
}

/**
 * Build an initialized service over a fresh mock binding. `initialize()` drives
 * the mock `load()` so `vdaOutcome` becomes `available` and the disabled-skill
 * gate — not VDA gating — is the only thing that can reject.
 */
async function makeReadyService(
  binding: MockVdaBinding,
  settings: AgentDesktopSettings
): Promise<AgentDesktopService> {
  const service = createAgentDesktopService({ binding, settings, platformSupported: true })
  await service.initialize()
  return service
}

/** Read the service's internal session (not exposed on the public state). */
function readSession(service: AgentDesktopService): AgentDesktopSession | null {
  return (service as unknown as { session: AgentDesktopSession | null }).session
}

// Shared generators.

/** Action names: a mix of in-surface Computer Use names and arbitrary strings. */
const actionNameArb: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom<string>(...CU_ACTION_NAMES),
  fc.string()
)

/** A simple, well-typed args record for the gate input. */
const argsArb: fc.Arbitrary<Record<string, unknown>> = fc.dictionary(
  fc.string(),
  fc.oneof(fc.string(), fc.integer(), fc.boolean())
)

/** Arbitrary gate input spanning capture / query / input / window-targeted shapes. */
const gateInputArb: fc.Arbitrary<GateInput> = fc.record({
  action: actionNameArb,
  args: argsArb,
  targetHwnd: fc.option(fc.integer({ min: 1, max: 1_000_000 }), { nil: undefined }),
  onAgentDesktop: fc.option(fc.boolean(), { nil: undefined }),
})

// ---------------------------------------------------------------------------
// Property 35 — Task 13.10
// ---------------------------------------------------------------------------

describe('AgentDesktopService — Property 35: disabled skill neither exposes actions nor provisions', () => {
  // Feature: agent-desktop, Property 35: Disabled skill neither exposes actions nor provisions
  // Validates: Requirements 10.9, 10.10
  it('while disabled, gateComputerAction permits no action and drives no OS operation (Req 10.9)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(gateInputArb, { minLength: 1, maxLength: 20 }),
        fc.boolean(),
        async (inputs, disclosureAcknowledged) => {
          const binding = new MockVdaBinding()
          const service = await makeReadyService(binding, disabledSettings(disclosureAcknowledged))

          // The VDA loaded (available) and the platform is supported, so the ONLY
          // thing gating actions is the disabled skill.
          expect(service.getState().vdaOutcome).toBe('available')

          for (const input of inputs) {
            const decision = await service.gateComputerAction(input)

            // No action is ever exposed/permitted while the skill is disabled.
            expect(decision.allow).toBe(false)
            if (!decision.allow) {
              expect(decision.outcome).toBe('rejected')
              // Disabled skill is the cause — not platform / VDA / some later gate.
              expect(decision.reason).toContain('skill is disabled')
            }
          }

          // The gate never counted a Computer Use action toward the cap...
          expect(service.getActionCount()).toBe(0)
          // ...and never touched a single native desktop operation.
          expect(binding.nativeCalls).toBe(0)
          expect(binding.createDesktopCalls).toBe(0)
          expect(binding.goToDesktopCalls).toHaveLength(0)
          // Capability stays unavailable while the skill is disabled (Req 10.9).
          expect(service.getState().capability).toBe('unavailable')
          // No session is ever created by gating attempts.
          expect(readSession(service)).toBeNull()
        }
      ),
      PROPERTY_TEST_CONFIG
    )
  })

  // Feature: agent-desktop, Property 35: Disabled skill neither exposes actions nor provisions
  // Validates: Requirements 10.9, 10.10
  it('while disabled, startSession never provisions an Agent_Desktop (Req 10.10)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1, maxLength: 16 }), { minLength: 1, maxLength: 10 }),
        fc.boolean(),
        async (runIds, disclosureAcknowledged) => {
          const binding = new MockVdaBinding()
          const service = await makeReadyService(binding, disabledSettings(disclosureAcknowledged))

          for (const runId of runIds) {
            const result = await service.startSession(runId)

            // Provisioning is refused and the disabled skill is the cause.
            expect(result.provisioned).toBe(false)
            if (!result.provisioned) {
              expect(result.error).toContain('disabled')
            }
            // No session is ever established.
            expect(readSession(service)).toBeNull()
          }

          // Never provisioned: no desktop created/removed, no display switch, and
          // not a single native desktop operation was driven (Req 10.10).
          expect(binding.nativeCalls).toBe(0)
          expect(binding.createDesktopCalls).toBe(0)
          expect(binding.removeDesktopCalls).toHaveLength(0)
          expect(binding.goToDesktopCalls).toHaveLength(0)
          // Capability stays unavailable for the whole disabled run.
          expect(service.getState().capability).toBe('unavailable')
        }
      ),
      PROPERTY_TEST_CONFIG
    )
  })

  // Positive control: proves the property above is not vacuously true. The same
  // gate inputs / provisioning that are uniformly refused while disabled are
  // permitted / provision once the skill is enabled.
  it('positive control: enabling the skill provisions and permits an auto-approve action', async () => {
    const binding = new MockVdaBinding()
    const service = await makeReadyService(binding, enabledSettings())

    // Provisioning now succeeds (contrast with Req 10.10 while disabled).
    const start = await service.startSession('run-control')
    expect(start.provisioned).toBe(true)
    expect(binding.createDesktopCalls).toBe(1)
    expect(readSession(service)).not.toBeNull()
    expect(service.getState().capability).toBe('active')

    // A read-only, non-window-targeted auto-approve action is now permitted
    // (contrast with Req 10.9 while disabled). `screenshot` carries a capture
    // redirect to the Agent_Desktop index.
    const decision = await service.gateComputerAction({ action: 'screenshot', args: {} })
    expect(decision.allow).toBe(true)
    if (decision.allow) {
      expect(decision.autoApprove).toBe(true)
      expect(decision.desktopOverride).toBe(binding.lastCreatedIndex)
    }
  })
})

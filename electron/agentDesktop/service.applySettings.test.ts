// @vitest-environment node

/**
 * Unit tests for `AgentDesktopService.applySettings` retain-on-failure behavior
 * (Task 14.2).
 *
 * These are example-based tests (not property tests). They focus on Req 10.7:
 * when mirrored renderer preferences cannot be applied (the payload is not a
 * usable settings record — `null`, `undefined`, a number, a string, or an
 * array), the service MUST retain the last successfully applied settings and
 * surface a user-visible error rather than resetting to the safe disabled
 * default. A subsequent usable record must still apply normally and clear the
 * error.
 *
 * A small disclosure-gating sanity check is included because enabling is gated
 * on the not-a-sandbox acknowledgement (Req 12.1, 12.2), but the primary focus
 * is the retain-on-failure contract of Req 10.7.
 *
 * The VDA binding is fully injected through {@link AgentDesktopServiceOptions.binding}
 * so the suite never touches a real DLL / `koffi` and stays deterministic.
 *
 * _Requirements: 10.7_
 */

import { describe, it, expect, vi } from 'vitest'

import { createAgentDesktopService, type AgentDesktopService } from './service'
import type { VdaBinding, VdaWindowInfo } from './vdaBinding'
import type { VdaLoadOutcome } from './types'
import { defaultAgentDesktopSettings, type AgentDesktopSettings } from './settings'

/**
 * A fully-mocked {@link VdaBinding} whose methods are `vi.fn()` spies. `load()`
 * resolves to the supplied outcome so `initialize()` records the matching
 * `vdaOutcome`. OS-driving methods are harmless no-ops; `applySettings` never
 * touches them.
 */
function makeMockBinding(options: {
  loadOutcome: VdaLoadOutcome
  loadError?: string | null
}): VdaBinding & { getLoadError: () => string | null } {
  const { loadOutcome, loadError = null } = options
  let available = false

  return {
    load: vi.fn(async (): Promise<VdaLoadOutcome> => {
      available = loadOutcome === 'available'
      return loadOutcome
    }),
    isAvailable: vi.fn(() => available),
    getLoadError: vi.fn(() => loadError),
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
 * A known-good applied settings shape that is deliberately distinct from the
 * safe disabled default (`enabled: false`, `ephemeral`, default timeout): the
 * skill is enabled, the disclosure is acknowledged, persistence is `persist`,
 * and the approval timeout is a non-default in-range value. If a failed apply
 * were to reset to the disabled default, `enabled`/`disclosureAcknowledged`
 * would flip, making the regression observable.
 */
const KNOWN_GOOD_TIMEOUT_MS = 30_000

function knownGoodSettings(): AgentDesktopSettings {
  return {
    ...defaultAgentDesktopSettings,
    approvalPolicy: { ...defaultAgentDesktopSettings.approvalPolicy },
    enabled: true,
    disclosureAcknowledged: true,
    persistence: 'persist',
    approvalTimeoutMs: KNOWN_GOOD_TIMEOUT_MS,
  }
}

/**
 * Construct a service seeded with {@link knownGoodSettings} and an available
 * VDA, then initialize it so `capability` resolves to `available` and the
 * "last successfully applied" baseline is established.
 */
async function makeInitializedService(): Promise<AgentDesktopService> {
  const binding = makeMockBinding({ loadOutcome: 'available' })
  const service = createAgentDesktopService({
    binding,
    settings: knownGoodSettings(),
    platformSupported: true,
  })
  await service.initialize()
  return service
}

/** The set of unusable payloads that constitute a "failure to apply" (Req 10.7). */
const INVALID_PAYLOADS: ReadonlyArray<{ label: string; value: unknown }> = [
  { label: 'null', value: null },
  { label: 'undefined', value: undefined },
  { label: 'a number', value: 42 },
  { label: 'a string', value: 'enabled' },
  { label: 'an array', value: [{ enabled: true }] },
]

describe('AgentDesktopService.applySettings — retain-on-failure (Req 10.7)', () => {
  describe.each(INVALID_PAYLOADS)('invalid payload: $label', ({ value }) => {
    it('retains the last good settings, surfaces an error, and does not throw', async () => {
      const service = await makeInitializedService()

      // Baseline: the last successfully applied settings (seeded known-good).
      const before = service.getState()
      expect(before.enabled).toBe(true)
      expect(before.disclosureAcknowledged).toBe(true)
      expect(before.capability).toBe('available')
      expect(before.lastError).toBeNull()

      // Applying an unusable payload must not throw and must return a valid state.
      let after: ReturnType<AgentDesktopService['getState']>
      expect(() => {
        after = service.applySettings(value)
      }).not.toThrow()

      // The settings-derived state is UNCHANGED — crucially `enabled` and
      // `disclosureAcknowledged` are NOT reset to the disabled default (which is
      // what Req 10.8's normalize-fallback would have produced). Retain != reset.
      expect(after!.enabled).toBe(true)
      expect(after!.disclosureAcknowledged).toBe(true)
      expect(after!.capability).toBe('available')

      // A user-visible error surfaces the failure to apply.
      expect(typeof after!.lastError).toBe('string')
      expect(after!.lastError).toContain('could not be applied')

      // The full observable snapshot is identical to the baseline apart from the
      // newly surfaced `lastError`, proving nothing else drifted on failure.
      const { lastError: _beforeErr, ...beforeRest } = before
      const { lastError: _afterErr, ...afterRest } = after!
      expect(afterRest).toEqual(beforeRest)

      // getState() agrees with the value returned by applySettings().
      expect(service.getState()).toEqual(after!)
    })
  })

  it('keeps prior good settings across a sequence of invalid payloads', async () => {
    const service = await makeInitializedService()
    const before = service.getState()

    for (const { value } of INVALID_PAYLOADS) {
      const state = service.applySettings(value)
      // Every failed apply continues to retain the same enabled/acknowledged state.
      expect(state.enabled).toBe(true)
      expect(state.disclosureAcknowledged).toBe(true)
      expect(state.lastError).toContain('could not be applied')
    }

    const after = service.getState()
    expect(after.enabled).toBe(before.enabled)
    expect(after.disclosureAcknowledged).toBe(before.disclosureAcknowledged)
    expect(after.capability).toBe(before.capability)
  })

  it('applies a valid record after a failed apply and clears the error', async () => {
    const service = await makeInitializedService()

    // Fail first so a lastError is present and the prior good settings are held.
    const failed = service.applySettings(null)
    expect(failed.enabled).toBe(true)
    expect(failed.lastError).toContain('could not be applied')

    // A usable record is normalized + applied: it IS able to change settings
    // (here it disables the skill) and the prior error is cleared.
    const disabled = service.applySettings({
      enabled: false,
      disclosureAcknowledged: true,
      persistence: 'ephemeral',
      approvalTimeoutMs: KNOWN_GOOD_TIMEOUT_MS,
    })
    expect(disabled.enabled).toBe(false)
    expect(disabled.disclosureAcknowledged).toBe(true)
    expect(disabled.capability).toBe('unavailable') // disabled skill ⇒ unavailable
    expect(disabled.lastError).toBeNull()

    // Re-enabling via a valid record also works (disclosure already acknowledged).
    const reEnabled = service.applySettings({
      enabled: true,
      disclosureAcknowledged: true,
      persistence: 'persist',
      approvalTimeoutMs: KNOWN_GOOD_TIMEOUT_MS,
    })
    expect(reEnabled.enabled).toBe(true)
    expect(reEnabled.capability).toBe('available')
    expect(reEnabled.lastError).toBeNull()
  })
})

describe('AgentDesktopService.applySettings — disclosure gating sanity (Req 12.1, 12.2)', () => {
  it('keeps enabled false when enabling without prior acknowledgement, then enables after acknowledgement', async () => {
    // Fresh service on the safe disabled default (disclosure NOT acknowledged).
    const binding = makeMockBinding({ loadOutcome: 'available' })
    const service = createAgentDesktopService({ binding, platformSupported: true })
    await service.initialize()

    expect(service.getState().disclosureAcknowledged).toBe(false)

    // Enabling without acknowledgement is force-gated to false (Req 12.1, 12.2).
    const gated = service.applySettings({ enabled: true })
    expect(gated.enabled).toBe(false)
    expect(gated.disclosureAcknowledged).toBe(false)
    expect(gated.capability).toBe('unavailable')

    // After acknowledging the disclosure, the same enable payload takes effect.
    service.acknowledgeDisclosure()
    expect(service.getState().disclosureAcknowledged).toBe(true)

    const enabled = service.applySettings({ enabled: true })
    expect(enabled.enabled).toBe(true)
    expect(enabled.disclosureAcknowledged).toBe(true)
    expect(enabled.capability).toBe('available')
  })
})

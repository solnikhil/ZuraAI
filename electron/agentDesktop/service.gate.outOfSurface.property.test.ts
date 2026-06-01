// @vitest-environment node

/**
 * Property-based test for Agent Desktop's out-of-surface action rejection.
 *
 * Feature: agent-desktop, Property 39: Actions outside the Computer Use surface are rejected
 * Validates: Requirements 12.6
 *
 * Property (design): *For any* requested action whose name is outside the
 * existing Computer Use action surface and matches no explicit allowlist entry,
 * the gate rejects the action.
 *
 * The Computer Use action surface Agent Desktop reuses is exactly:
 *   screenshot, click, type, key, scroll, cursor_position,
 *   list_windows, launch_app, close_app, find_app
 *
 * `AgentDesktopService.gateComputerAction` runs the out-of-surface gate (Req
 * 12.6) immediately after the availability gate and before the abort / session
 * / action-cap / presence / targeting / approval gates. So to isolate this
 * property the service is set up fully available, enabled, disclosure-
 * acknowledged, and with a provisioned session — that way an out-of-surface
 * rejection can only come from the out-of-surface gate itself, never from an
 * unavailable capability.
 *
 * Native side-effects (the VDA binding) are fully injected/mocked; the gate
 * itself drives no OS work on a rejection (Req 4.7), so no nut.js / capturer
 * mocking is required for this property.
 */

import { describe, it, expect, vi } from 'vitest'
import * as fc from 'fast-check'

import { createAgentDesktopService } from './service'
import type { VdaBinding, VdaWindowInfo } from './vdaBinding'
import type { VdaLoadOutcome, AgentActionType, ActionClassification } from './types'
import { defaultAgentDesktopSettings, type AgentDesktopSettings } from './settings'

/**
 * Shared property-test configuration. A stable seed keeps any failure
 * reproducible, and `numRuns` comfortably satisfies the spec's
 * minimum-100-iterations requirement for property tests.
 */
const PROPERTY_TEST_CONFIG = {
  numRuns: 200,
  seed: 0x5eed,
}

/**
 * The complete Computer Use action surface Agent Desktop reuses. Mirrors the
 * (non-exported) `AGENT_ACTION_TYPES` set in `service.ts` so generators can
 * model "in-surface" vs "out-of-surface" exactly.
 */
const ALL_AGENT_ACTION_TYPES: readonly AgentActionType[] = [
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

const KNOWN_ACTION_SET = new Set<string>(ALL_AGENT_ACTION_TYPES)

/**
 * Object keys we never inject into a generated approval policy. Assigning to
 * these would mutate prototype state rather than add a real allowlist entry, so
 * they are excluded to keep the "no explicit allowlist entry" property honest.
 */
const DANGEROUS_KEYS = new Set<string>(['__proto__', 'constructor', 'prototype'])

/** True when `s` is genuinely outside the Computer Use action surface. */
function isOutOfSurface(s: string): boolean {
  return !KNOWN_ACTION_SET.has(s) && !DANGEROUS_KEYS.has(s)
}

const generators = {
  /**
   * An action name guaranteed to be outside the Computer Use surface: arbitrary
   * strings (including empty / whitespace / unicode), plus a curated set of
   * realistic near-misses (case variants, plausible-but-wrong aliases).
   */
  outOfSurfaceAction: fc.oneof(
    fc.string().filter(isOutOfSurface),
    fc
      .constantFrom(
        'Screenshot',
        'CLICK',
        'Type',
        'screenshot ',
        ' click',
        'left_click',
        'double_click',
        'right_click',
        'mouse_move',
        'move',
        'drag',
        'paste',
        'open_app',
        'kill_app',
        'terminate',
        'wait',
        'navigate',
        'scroll_up',
        'list_apps',
        'find_window',
        'computer',
        'exec',
        'shell',
        ''
      )
      .filter(isOutOfSurface)
  ),

  /** Arbitrary raw action arguments forwarded to the gate. */
  args: fc.dictionary(
    fc.string(),
    fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null))
  ),

  /** An optional target window handle (present for window-targeted actions). */
  targetHwnd: fc.option(fc.integer({ min: 1, max: 1_000_000 }), { nil: undefined }),

  /** An optional caller-resolved residence confirmation. */
  onAgentDesktop: fc.option(fc.boolean(), { nil: undefined }),
}

/**
 * A fully-mocked {@link VdaBinding} whose methods are `vi.fn()` spies. `load()`
 * resolves to `available`, so the service reaches the action gate; provisioning
 * uses `getCurrentDesktopIndex` + `createDesktop`. All native methods are
 * no-ops / fixed returns so no real OS work occurs.
 */
function makeMockBinding(): VdaBinding & { getLoadError: () => string | null } {
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

/** Settings with the skill enabled and the disclosure acknowledged. */
function enabledSettings(overrides?: Partial<AgentDesktopSettings>): AgentDesktopSettings {
  return {
    ...defaultAgentDesktopSettings,
    approvalPolicy: { ...defaultAgentDesktopSettings.approvalPolicy },
    enabled: true,
    disclosureAcknowledged: true,
    ...overrides,
  }
}

/**
 * Build a fully-available, enabled service with a provisioned session, so the
 * availability gate always passes and any rejection of an out-of-surface action
 * is attributable to the out-of-surface gate alone.
 */
async function makeProvisionedService(settings?: AgentDesktopSettings) {
  const binding = makeMockBinding()
  const service = createAgentDesktopService({
    binding,
    settings: settings ?? enabledSettings(),
    platformSupported: true,
  })
  await service.initialize()
  const start = await service.startSession('run-out-of-surface')
  return { service, binding, start }
}

describe('gateComputerAction — Property 39: actions outside the Computer Use surface are rejected', () => {
  // Feature: agent-desktop, Property 39: Actions outside the Computer Use surface are rejected
  // Validates: Requirements 12.6
  it('rejects any requested action whose name is outside the Computer Use surface', async () => {
    await fc.assert(
      fc.asyncProperty(
        generators.outOfSurfaceAction,
        generators.args,
        generators.targetHwnd,
        generators.onAgentDesktop,
        async (action, args, targetHwnd, onAgentDesktop) => {
          const { service, binding } = await makeProvisionedService()
          try {
            const decision = await service.gateComputerAction({
              action,
              args,
              targetHwnd,
              onAgentDesktop,
            })

            // The gate must reject the out-of-surface action.
            expect(decision.allow).toBe(false)
            if (!decision.allow) {
              expect(decision.outcome).toBe('rejected')
              expect(decision.reason).toContain('Computer Use action surface')
            }

            // Rejection drives no OS work and never falls back to the
            // User_Desktop (Req 4.7): the gate must not switch / create / move.
            expect(binding.goToDesktop).not.toHaveBeenCalled()
            expect(binding.moveWindowToDesktop).not.toHaveBeenCalled()
          } finally {
            service.dispose()
          }
        }
      ),
      PROPERTY_TEST_CONFIG
    )
  })

  // Feature: agent-desktop, Property 39: Actions outside the Computer Use surface are rejected
  // Validates: Requirements 12.6
  it('cannot be made to allow an out-of-surface action via an explicit approval-policy entry', async () => {
    await fc.assert(
      fc.asyncProperty(generators.outOfSurfaceAction, async (action) => {
        // Attempt to "allowlist" the out-of-surface action by injecting it into
        // the approval policy as auto-approve. The gate's surface check runs
        // before the approval-policy classification, so this must NOT allow it
        // — there is no explicit allowlist entry that can bypass the surface.
        const settings = enabledSettings()
        ;(settings.approvalPolicy as Record<string, ActionClassification>)[action] = 'auto-approve'

        const { service } = await makeProvisionedService(settings)
        try {
          const decision = await service.gateComputerAction({ action, args: {} })
          expect(decision.allow).toBe(false)
          if (!decision.allow) {
            expect(decision.outcome).toBe('rejected')
          }
        } finally {
          service.dispose()
        }
      }),
      PROPERTY_TEST_CONFIG
    )
  })

  // Feature: agent-desktop, Property 39: Actions outside the Computer Use surface are rejected
  // Validates: Requirements 12.6
  it('harness sanity: in-surface read actions are NOT rejected for being out-of-surface', async () => {
    // Confirms the availability gate is genuinely passing, so the rejections
    // above are attributable to the out-of-surface gate rather than an
    // unavailable capability.
    const { service, start } = await makeProvisionedService()
    try {
      expect(start.provisioned).toBe(true)

      for (const action of ['screenshot', 'list_windows', 'find_app'] as AgentActionType[]) {
        const decision = await service.gateComputerAction({ action, args: {} })
        expect(decision.allow).toBe(true)
      }
    } finally {
      service.dispose()
    }
  })
})

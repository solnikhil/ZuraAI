/**
 * Property-based tests for Agent Desktop settings normalization.
 *
 * These tests exercise `normalizeAgentDesktopSettings` against a wide range of
 * generated inputs (including arbitrary garbage) to verify universal safety and
 * well-formedness guarantees, the approval-policy persistence round-trip, and
 * the approval-timeout clamping behavior.
 *
 * Covered correctness properties (from the agent-desktop design):
 * - Property 33: Settings normalization is safe and well-formed
 * - Property 34: Approval-policy edits round-trip through persistence
 * - Property 21: Approval timeout is clamped
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  normalizeAgentDesktopSettings,
  defaultAgentDesktopSettings,
  type AgentDesktopSettings,
} from './settings'
import {
  DEFAULT_APPROVAL_TIMEOUT_MS,
  MIN_APPROVAL_TIMEOUT_MS,
  MAX_APPROVAL_TIMEOUT_MS,
} from './constants'
import type { AgentActionType, ActionClassification } from './types'

/**
 * Shared property-test configuration.
 *
 * The seed is fixed so any failure is reproducible. `numRuns` is held at the
 * required minimum of 100 iterations.
 */
const PROPERTY_TEST_CONFIG = {
  numRuns: 100,
  seed: 12345,
} as const

/**
 * The complete Computer Use action surface that Agent Desktop reuses. Mirrors
 * `ALL_AGENT_ACTION_TYPES` inside `settings.ts` (kept local to the test so the
 * property checks the public contract rather than the module's internals).
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

/**
 * Action types that must always be `approval-required` after normalization
 * regardless of the stored value (Req 5.5 dangerous-action handling).
 */
const FORCED_APPROVAL_ACTIONS: readonly AgentActionType[] = ['launch_app', 'close_app']

const VALID_CLASSIFICATIONS: readonly ActionClassification[] = ['auto-approve', 'approval-required']

/** Generator for a single valid approval classification. */
const classificationArb = fc.constantFrom<ActionClassification>(...VALID_CLASSIFICATIONS)

/**
 * Generator for a fully-populated, well-formed approval policy: every action
 * type present and mapped to a valid classification.
 */
const wellFormedPolicyArb = fc.record(
  Object.fromEntries(ALL_AGENT_ACTION_TYPES.map((action) => [action, classificationArb])) as Record<
    AgentActionType,
    fc.Arbitrary<ActionClassification>
  >
) as fc.Arbitrary<Record<AgentActionType, ActionClassification>>

/**
 * Asserts the standard well-formedness invariants on a normalized result. These
 * must hold for ANY input per Property 33.
 */
function expectWellFormed(result: AgentDesktopSettings): void {
  expect(typeof result.enabled).toBe('boolean')
  expect(typeof result.disclosureAcknowledged).toBe('boolean')
  expect(['persist', 'ephemeral']).toContain(result.persistence)

  // Approval policy must have a valid entry for EVERY action type.
  expect(Object.keys(result.approvalPolicy).sort()).toEqual([...ALL_AGENT_ACTION_TYPES].sort())
  for (const action of ALL_AGENT_ACTION_TYPES) {
    expect(VALID_CLASSIFICATIONS).toContain(result.approvalPolicy[action])
  }

  // Timeout must be a finite number inside the clamp range.
  expect(Number.isFinite(result.approvalTimeoutMs)).toBe(true)
  expect(result.approvalTimeoutMs).toBeGreaterThanOrEqual(MIN_APPROVAL_TIMEOUT_MS)
  expect(result.approvalTimeoutMs).toBeLessThanOrEqual(MAX_APPROVAL_TIMEOUT_MS)
}

describe('Agent Desktop settings normalization (property-based)', () => {
  // Feature: agent-desktop, Property 33: Settings normalization is safe and well-formed
  describe('Property 33: Settings normalization is safe and well-formed', () => {
    /**
     * For ANY arbitrary/malformed input, normalization never throws and always
     * returns a well-formed AgentDesktopSettings.
     *
     * Validates: Requirements 10.2, 10.4, 10.8
     */
    it('produces a well-formed result for arbitrary input and never throws', () => {
      fc.assert(
        fc.property(fc.anything(), (raw) => {
          const result = normalizeAgentDesktopSettings(raw)
          expectWellFormed(result)
        }),
        PROPERTY_TEST_CONFIG
      )
    })

    /**
     * Invalid/unreadable input (anything that is not a plain object record)
     * must fall back to the safe disabled default, which never provisions an
     * Agent_Desktop (`enabled: false`).
     *
     * Validates: Requirements 10.2, 10.8
     */
    it('falls back to the safe disabled default for non-record input', () => {
      const nonRecordArb = fc.oneof(
        fc.constant(null),
        fc.constant(undefined),
        fc.string(),
        fc.integer(),
        fc.double(),
        fc.boolean(),
        fc.array(fc.anything())
      )

      fc.assert(
        fc.property(nonRecordArb, (raw) => {
          const result = normalizeAgentDesktopSettings(raw)
          expect(result).toEqual(defaultAgentDesktopSettings)
          expect(result.enabled).toBe(false)
        }),
        PROPERTY_TEST_CONFIG
      )
    })

    /**
     * `enabled` / `disclosureAcknowledged` only survive as `true` when the
     * stored value is a real boolean; every other shape collapses to `false`.
     *
     * Validates: Requirements 10.2
     */
    it('only accepts boolean enabled / disclosureAcknowledged values', () => {
      fc.assert(
        fc.property(fc.anything(), fc.anything(), (enabled, disclosureAcknowledged) => {
          const result = normalizeAgentDesktopSettings({ enabled, disclosureAcknowledged })
          expect(result.enabled).toBe(enabled === true)
          expect(result.disclosureAcknowledged).toBe(disclosureAcknowledged === true)
        }),
        PROPERTY_TEST_CONFIG
      )
    })

    /**
     * `persistence` is exactly `persist` only when stored as the literal
     * `'persist'`; any other value normalizes to `ephemeral` (Req 10.4).
     *
     * Validates: Requirements 10.4
     */
    it('constrains persistence to persist | ephemeral', () => {
      fc.assert(
        fc.property(fc.anything(), (persistence) => {
          const result = normalizeAgentDesktopSettings({ persistence })
          expect(['persist', 'ephemeral']).toContain(result.persistence)
          expect(result.persistence).toBe(persistence === 'persist' ? 'persist' : 'ephemeral')
        }),
        PROPERTY_TEST_CONFIG
      )
    })
  })

  // Feature: agent-desktop, Property 34: Approval-policy edits round-trip through persistence
  describe('Property 34: Approval-policy edits round-trip through persistence', () => {
    /**
     * For any valid approval-policy edit, serializing through persistence and
     * normalizing preserves each per-action classification, except the
     * always-`approval-required` dangerous actions (launch_app / close_app).
     *
     * Validates: Requirements 10.5
     */
    it('preserves each per-action classification across a persistence round-trip', () => {
      fc.assert(
        fc.property(wellFormedPolicyArb, (editedPolicy) => {
          const settings: AgentDesktopSettings = {
            ...defaultAgentDesktopSettings,
            approvalPolicy: editedPolicy,
          }

          // Simulate persistence to localStorage and back.
          const serialized = JSON.parse(JSON.stringify(settings))
          const result = normalizeAgentDesktopSettings(serialized)

          for (const action of ALL_AGENT_ACTION_TYPES) {
            if (FORCED_APPROVAL_ACTIONS.includes(action)) {
              expect(result.approvalPolicy[action]).toBe('approval-required')
            } else {
              expect(result.approvalPolicy[action]).toBe(editedPolicy[action])
            }
          }
        }),
        PROPERTY_TEST_CONFIG
      )
    })

    /**
     * The forced dangerous actions stay `approval-required` even when an edit
     * tries to downgrade them to `auto-approve`.
     *
     * Validates: Requirements 10.5
     */
    it('never lets a persisted edit downgrade launch_app / close_app', () => {
      fc.assert(
        fc.property(wellFormedPolicyArb, (editedPolicy) => {
          const downgraded: Record<AgentActionType, ActionClassification> = {
            ...editedPolicy,
            launch_app: 'auto-approve',
            close_app: 'auto-approve',
          }
          const result = normalizeAgentDesktopSettings({ approvalPolicy: downgraded })
          expect(result.approvalPolicy.launch_app).toBe('approval-required')
          expect(result.approvalPolicy.close_app).toBe('approval-required')
        }),
        PROPERTY_TEST_CONFIG
      )
    })
  })

  // Feature: agent-desktop, Property 21: Approval timeout is clamped
  describe('Property 21: Approval timeout is clamped', () => {
    /**
     * For any finite numeric input, the effective timeout is clamped into
     * [MIN_APPROVAL_TIMEOUT_MS, MAX_APPROVAL_TIMEOUT_MS]: in-range values pass
     * through, out-of-range values clamp to the nearest bound.
     *
     * Validates: Requirements 5.6
     */
    it('clamps any finite numeric input into [5000, 600000]', () => {
      const finiteNumberArb = fc.double({
        min: -100_000,
        max: 1_000_000,
        noNaN: true,
        noDefaultInfinity: true,
      })

      fc.assert(
        fc.property(finiteNumberArb, (raw) => {
          const result = normalizeAgentDesktopSettings({ approvalTimeoutMs: raw }).approvalTimeoutMs

          const expected =
            raw < MIN_APPROVAL_TIMEOUT_MS
              ? MIN_APPROVAL_TIMEOUT_MS
              : raw > MAX_APPROVAL_TIMEOUT_MS
                ? MAX_APPROVAL_TIMEOUT_MS
                : raw

          expect(result).toBe(expected)
          expect(result).toBeGreaterThanOrEqual(MIN_APPROVAL_TIMEOUT_MS)
          expect(result).toBeLessThanOrEqual(MAX_APPROVAL_TIMEOUT_MS)
        }),
        PROPERTY_TEST_CONFIG
      )
    })

    /**
     * Values already inside the range pass through unchanged.
     *
     * Validates: Requirements 5.6
     */
    it('passes through in-range values unchanged', () => {
      const inRangeArb = fc.double({
        min: MIN_APPROVAL_TIMEOUT_MS,
        max: MAX_APPROVAL_TIMEOUT_MS,
        noNaN: true,
        noDefaultInfinity: true,
      })

      fc.assert(
        fc.property(inRangeArb, (raw) => {
          const result = normalizeAgentDesktopSettings({ approvalTimeoutMs: raw }).approvalTimeoutMs
          expect(result).toBe(raw)
        }),
        PROPERTY_TEST_CONFIG
      )
    })

    /**
     * Absent / NaN / Infinity / non-number inputs fall back to the 60000ms
     * default.
     *
     * Validates: Requirements 5.6
     */
    it('falls back to the default for absent, NaN, or non-number input', () => {
      const invalidTimeoutArb = fc.oneof(
        fc.constant(undefined),
        fc.constant(null),
        fc.constant(Number.NaN),
        fc.constant(Number.POSITIVE_INFINITY),
        fc.constant(Number.NEGATIVE_INFINITY),
        fc.string(),
        fc.boolean(),
        fc.array(fc.anything()),
        fc.record({ ms: fc.integer() })
      )

      fc.assert(
        fc.property(invalidTimeoutArb, (raw) => {
          const result = normalizeAgentDesktopSettings({ approvalTimeoutMs: raw }).approvalTimeoutMs
          expect(result).toBe(DEFAULT_APPROVAL_TIMEOUT_MS)
        }),
        PROPERTY_TEST_CONFIG
      )
    })
  })
})

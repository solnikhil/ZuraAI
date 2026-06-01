/**
 * Property-based tests for the Agent Desktop approval policy.
 *
 * These tests assert universal properties of the pure `classifyAction` core and
 * its interaction with settings normalization, exercised across a wide range of
 * generated inputs rather than a handful of hand-picked examples.
 *
 * Covered correctness properties (from the design):
 * - Property 18: Approval classification is allowlist-driven (Req 5.1, 5.2)
 * - Property 20: Dangerous action types are always approval-required (Req 5.5)
 *
 * The approval policy is fail-closed by construction: an action is
 * `auto-approve` only when the policy explicitly classifies it as such; every
 * other case (missing/malformed entry, malformed policy object, unknown action)
 * must resolve to `approval-required`.
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

import { classifyAction, type ApprovalPolicy } from './approvalPolicy'
import { normalizeAgentDesktopSettings } from './settings'
import type { AgentActionType, ActionClassification } from './types'

/**
 * Shared property-test configuration.
 *
 * A stable seed keeps any failure reproducible, and `numRuns` satisfies the
 * spec's minimum-100-iterations requirement for property tests.
 */
const PROPERTY_TEST_CONFIG = {
  numRuns: 200,
  seed: 0x5eed,
}

/**
 * The complete Computer Use action surface Agent Desktop reuses. Mirrors the
 * (non-exported) list in `settings.ts` so generators can target real actions.
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

/** Action types normalization must always force to `approval-required` (Req 5.5). */
const FORCED_APPROVAL_ACTIONS: readonly AgentActionType[] = ['launch_app', 'close_app']

const generators = {
  /** A valid, well-formed action classification. */
  validClassification: fc.constantFrom<ActionClassification>('auto-approve', 'approval-required'),

  /**
   * An arbitrary "classification-ish" value: sometimes a valid classification,
   * sometimes malformed (wrong string, number, boolean, null, undefined). Used
   * to populate policy entries so the IFF relationship is exercised against
   * both well-formed and malformed stored values.
   */
  classificationValue: fc.oneof(
    fc.constantFrom<ActionClassification>('auto-approve', 'approval-required'),
    fc.string(),
    fc.integer(),
    fc.boolean(),
    fc.constant(null),
    fc.constant(undefined)
  ),

  /** A known action type drawn from the real Computer Use surface. */
  knownAction: fc.constantFrom<AgentActionType>(...ALL_AGENT_ACTION_TYPES),

  /**
   * An "unknown" action: any non-empty string that is not a known action type,
   * cast to `AgentActionType` to model out-of-surface / unexpected inputs.
   */
  unknownAction: fc
    .string({ minLength: 1, maxLength: 12 })
    .filter((s) => !ALL_AGENT_ACTION_TYPES.includes(s as AgentActionType))
    .map((s) => s as AgentActionType),

  /** Any action key, known or unknown. */
  anyAction: fc.oneof(
    fc.constantFrom<AgentActionType>(...ALL_AGENT_ACTION_TYPES),
    fc
      .string({ minLength: 1, maxLength: 12 })
      .filter((s) => !ALL_AGENT_ACTION_TYPES.includes(s as AgentActionType))
      .map((s) => s as AgentActionType)
  ),
}

/**
 * An arbitrary `classifications` map keyed by a mix of known action types and
 * random extra keys, with arbitrary (possibly malformed) values. Cast to the
 * declared record type to match the `ApprovalPolicy` shape while still feeding
 * realistically messy data through the pure classifier.
 */
const classificationsArb = fc
  .dictionary(
    fc.oneof(fc.constantFrom<string>(...ALL_AGENT_ACTION_TYPES), fc.string({ minLength: 1, maxLength: 8 })),
    generators.classificationValue
  )
  .map((record) => record as Record<AgentActionType, ActionClassification>)

describe('classifyAction — Property 18: approval classification is allowlist-driven', () => {
  // Feature: agent-desktop, Property 18: Approval classification is allowlist-driven
  // Validates: Requirements 5.1, 5.2
  it('returns auto-approve if and only if the policy entry is exactly "auto-approve"', () => {
    fc.assert(
      fc.property(generators.anyAction, classificationsArb, (action, classifications) => {
        const policy: ApprovalPolicy = { classifications }
        const result = classifyAction(action, policy)

        const entry = (classifications as Record<string, unknown>)[action as string]
        if (entry === 'auto-approve') {
          // The allowlist explicitly auto-approves this action.
          expect(result).toBe('auto-approve')
        } else {
          // Missing, malformed, or approval-required entries fail closed.
          expect(result).toBe('approval-required')
        }
      }),
      PROPERTY_TEST_CONFIG
    )
  })

  // Feature: agent-desktop, Property 18: Approval classification is allowlist-driven
  // Validates: Requirements 5.1, 5.2
  it('classifies any unknown / out-of-surface action as approval-required', () => {
    fc.assert(
      fc.property(generators.unknownAction, classificationsArb, (unknownAction, classifications) => {
        const policy: ApprovalPolicy = { classifications }
        const result = classifyAction(unknownAction, policy)

        // An unknown action is auto-approve only if some arbitrary key collided
        // with it and happens to be 'auto-approve'; otherwise it must fail closed.
        const entry = (classifications as Record<string, unknown>)[unknownAction as string]
        expect(result).toBe(entry === 'auto-approve' ? 'auto-approve' : 'approval-required')
      }),
      PROPERTY_TEST_CONFIG
    )
  })

  // Feature: agent-desktop, Property 18: Approval classification is allowlist-driven
  // Validates: Requirements 5.1, 5.2
  it('fails closed to approval-required when the policy object is missing or malformed', () => {
    const malformedPolicyArb = fc.oneof(
      fc.constant(null),
      fc.constant(undefined),
      fc.string(),
      fc.integer(),
      fc.boolean(),
      fc.array(generators.classificationValue),
      // Well-shaped object but with a missing/malformed classifications map.
      fc.record({
        classifications: fc.oneof(
          fc.constant(null),
          fc.constant(undefined),
          fc.string(),
          fc.integer(),
          fc.boolean()
        ),
      })
    )

    fc.assert(
      fc.property(generators.anyAction, malformedPolicyArb, (action, malformedPolicy) => {
        // Cast through unknown: classifyAction is contracted to defend against
        // exactly these malformed inputs at runtime.
        const result = classifyAction(action, malformedPolicy as unknown as ApprovalPolicy)
        expect(result).toBe('approval-required')
      }),
      PROPERTY_TEST_CONFIG
    )
  })
})

/**
 * Raw approval-policy input where `launch_app` / `close_app` are deliberately
 * biased toward `auto-approve` so the normalization forcing is genuinely
 * exercised, while the remaining entries stay arbitrary (and possibly malformed).
 */
const rawApprovalPolicyArb = fc
  .dictionary(
    fc.oneof(fc.constantFrom<string>(...ALL_AGENT_ACTION_TYPES), fc.string({ minLength: 1, maxLength: 8 })),
    generators.classificationValue
  )
  .map((record) => {
    // Strongly bias the dangerous actions toward an (invalid) auto-approve so we
    // confirm normalization overrides stored values rather than passing them through.
    return {
      ...record,
      launch_app: 'auto-approve',
      close_app: 'auto-approve',
    }
  })

const rawSettingsArb = fc.record(
  {
    enabled: fc.oneof(fc.boolean(), fc.string(), fc.integer(), fc.constant(null)),
    disclosureAcknowledged: fc.oneof(fc.boolean(), fc.string(), fc.constant(null)),
    persistence: fc.oneof(fc.constantFrom('persist', 'ephemeral'), fc.string(), fc.constant(null)),
    approvalPolicy: rawApprovalPolicyArb,
    approvalTimeoutMs: fc.oneof(fc.integer(), fc.double(), fc.string(), fc.constant(null)),
  },
  { requiredKeys: [] }
)

describe('classifyAction — Property 20: dangerous action types are always approval-required', () => {
  // Feature: agent-desktop, Property 20: Dangerous action types are always approval-required
  // Validates: Requirements 5.5
  it('forces launch_app and close_app to approval-required after normalization, even when raw input tried auto-approve', () => {
    fc.assert(
      fc.property(rawSettingsArb, (raw) => {
        const normalized = normalizeAgentDesktopSettings(raw)
        const policy: ApprovalPolicy = { classifications: normalized.approvalPolicy }

        for (const action of FORCED_APPROVAL_ACTIONS) {
          expect(classifyAction(action, policy)).toBe('approval-required')
        }
      }),
      PROPERTY_TEST_CONFIG
    )
  })

  // Feature: agent-desktop, Property 20: Dangerous action types are always approval-required
  // Validates: Requirements 5.5
  it('forces launch_app and close_app to approval-required for any arbitrary / malformed raw input', () => {
    fc.assert(
      fc.property(fc.anything(), (raw) => {
        const normalized = normalizeAgentDesktopSettings(raw)
        const policy: ApprovalPolicy = { classifications: normalized.approvalPolicy }

        for (const action of FORCED_APPROVAL_ACTIONS) {
          expect(classifyAction(action, policy)).toBe('approval-required')
        }
      }),
      PROPERTY_TEST_CONFIG
    )
  })
})

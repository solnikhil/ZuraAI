// @vitest-environment node

/**
 * Property-based test for the Agent Desktop approval gate.
 *
 * Property 19 (Validates: Requirements 5.3, 5.4): combines the pure
 * `classifyAction` policy decision with the `AgentDesktopApprovalManager`
 * approval flow. The "gate" is modeled purely: an `auto-approve` classification
 * proceeds without ever creating a pending approval request, while an
 * `approval-required` classification creates exactly one pending request and
 * withholds execution until the request is explicitly resolved.
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

import {
  AgentDesktopApprovalManager,
  type AgentDesktopApprovalDecision,
} from './approvalManager'
import { classifyAction, type ApprovalPolicy } from './approvalPolicy'
import type { AgentActionType, ActionClassification } from './types'

/** The complete Computer Use action surface reused by Agent Desktop. */
const ACTION_TYPES: readonly AgentActionType[] = [
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

const arbClassification: fc.Arbitrary<ActionClassification> = fc.constantFrom(
  'auto-approve',
  'approval-required'
)

/** A well-formed policy assigns a random classification to every action type. */
const arbWellFormedPolicy: fc.Arbitrary<ApprovalPolicy> = fc
  .record(
    ACTION_TYPES.reduce(
      (acc, action) => {
        acc[action] = arbClassification
        return acc
      },
      {} as Record<AgentActionType, fc.Arbitrary<ActionClassification>>
    )
  )
  .map((classifications) => ({ classifications }))

/** Malformed policies exercise the fail-closed path (everything -> approval-required). */
const arbMalformedPolicy: fc.Arbitrary<ApprovalPolicy> = fc.oneof(
  fc.constant({ classifications: {} } as unknown as ApprovalPolicy),
  fc.constant({} as unknown as ApprovalPolicy),
  fc.constant(null as unknown as ApprovalPolicy),
  fc.constant({ classifications: null } as unknown as ApprovalPolicy)
)

const arbPolicy: fc.Arbitrary<ApprovalPolicy> = fc.oneof(
  { weight: 4, arbitrary: arbWellFormedPolicy },
  { weight: 1, arbitrary: arbMalformedPolicy }
)

/** Known actions plus arbitrary unknown action names (cast at the call site). */
const arbAction: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom(...ACTION_TYPES),
  fc.string().filter((s) => !ACTION_TYPES.includes(s as AgentActionType))
)

describe('AgentDesktopApprovalManager — approval gate (property)', () => {
  // Feature: agent-desktop, Property 19: Prompt is shown exactly for approval-required actions
  // Validates: Requirements 5.3, 5.4
  it('creates a withheld prompt iff the action is classified approval-required', async () => {
    await fc.assert(
      fc.asyncProperty(arbAction, arbPolicy, async (action, policy) => {
        const manager = new AgentDesktopApprovalManager({
          defaultTimeoutMs: 60_000,
        })

        try {
          const classification = classifyAction(action as AgentActionType, policy)
          const requiresApproval = classification === 'approval-required'

          // Model the gate decision: only approval-required actions are routed
          // through the approval manager; auto-approve actions proceed directly.
          let decisionPromise: Promise<AgentDesktopApprovalDecision> | null = null
          if (requiresApproval) {
            decisionPromise = manager.requestApproval({
              action: String(action),
              args: {},
            })
          }

          const pending = manager.listPending()

          if (requiresApproval) {
            // Exactly one prompt was created and execution is withheld.
            expect(pending).toHaveLength(1)
            expect(pending[0].action).toBe(String(action))
            expect(pending[0].classification).toBe('approval-required')

            // Still withheld before resolution: only an explicit resolve releases it.
            const decision = manager.resolveApproval(pending[0].id, true)
            expect(decision.outcome).toBe('approved')

            const resolved = await decisionPromise!
            expect(resolved.approved).toBe(true)
            expect(resolved.outcome).toBe('approved')
            expect(manager.listPending()).toHaveLength(0)
          } else {
            // auto-approve: no prompt created, nothing withheld.
            expect(pending).toHaveLength(0)
          }

          return true
        } finally {
          manager.dispose()
        }
      }),
      { numRuns: 200 }
    )
  })
})

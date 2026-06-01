/**
 * Property-based tests for the Agent Desktop capability-state resolver.
 *
 * These tests assert universal properties of the pure
 * `resolveAgentDesktopCapability` core, exercised across the full four-way
 * boolean combination of its inputs rather than a handful of hand-picked
 * examples.
 *
 * Covered correctness properties (from the design):
 * - Property 32: Capability-state resolution (Req 11.1, 8.5, 9.2)
 *
 * The resolver is fail-closed by construction: any one of an unsupported
 * platform, an unavailable VDA binding, or a disabled skill forces
 * `unavailable`, and those conditions take precedence over a provisioned
 * session so a session can never report a usable state once the capability has
 * been lost.
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

import {
  resolveAgentDesktopCapability,
  type AgentDesktopCapabilityInput,
} from './agentRun'
import type { AgentDesktopCapabilityState } from '../chat/types'

/**
 * Shared property-test configuration.
 *
 * A stable seed keeps any failure reproducible, and `numRuns` satisfies the
 * spec's minimum-100-iterations requirement for property tests.
 */
const PROPERTY_TEST_CONFIG = {
  numRuns: 256,
  seed: 0x5eed,
}

/** The three legal capability states the resolver may return. */
const VALID_STATES: readonly AgentDesktopCapabilityState[] = [
  'available',
  'active',
  'unavailable',
]

/**
 * Arbitrary covering the full four-way boolean combination of resolver inputs.
 * Each field is an independent boolean so the 16 possible combinations are all
 * reachable across runs.
 */
const capabilityInputArb: fc.Arbitrary<AgentDesktopCapabilityInput> = fc.record({
  platformSupported: fc.boolean(),
  vdaAvailable: fc.boolean(),
  skillEnabled: fc.boolean(),
  sessionActive: fc.boolean(),
})

/**
 * Independent reference implementation of the spec's decision, used to assert
 * the resolver matches the design's stated rules rather than re-deriving them
 * from the implementation under test.
 */
function expectedState(input: AgentDesktopCapabilityInput): AgentDesktopCapabilityState {
  const unavailable = !input.platformSupported || !input.vdaAvailable || !input.skillEnabled
  if (unavailable) return 'unavailable'
  return input.sessionActive ? 'active' : 'available'
}

describe('resolveAgentDesktopCapability — Property 32: capability-state resolution', () => {
  // Feature: agent-desktop, Property 32: Capability-state resolution
  // Validates: Requirements 11.1, 8.5, 9.2
  it('always resolves to exactly one of available, active, or unavailable', () => {
    fc.assert(
      fc.property(capabilityInputArb, (input) => {
        const result = resolveAgentDesktopCapability(input)
        expect(VALID_STATES).toContain(result)
      }),
      PROPERTY_TEST_CONFIG
    )
  })

  // Feature: agent-desktop, Property 32: Capability-state resolution
  // Validates: Requirements 11.1, 8.5, 9.2
  it('matches the spec decision across the full four-way boolean combination', () => {
    fc.assert(
      fc.property(capabilityInputArb, (input) => {
        expect(resolveAgentDesktopCapability(input)).toBe(expectedState(input))
      }),
      PROPERTY_TEST_CONFIG
    )
  })

  // Feature: agent-desktop, Property 32: Capability-state resolution
  // Validates: Requirements 8.5, 9.2
  it('resolves unavailable whenever the platform is unsupported, the VDA is unavailable, or the skill is disabled', () => {
    fc.assert(
      fc.property(
        capabilityInputArb.filter(
          (input) => !input.platformSupported || !input.vdaAvailable || !input.skillEnabled
        ),
        (input) => {
          // Unavailable conditions take precedence over an active session
          // regardless of sessionActive.
          expect(resolveAgentDesktopCapability(input)).toBe('unavailable')
        }
      ),
      PROPERTY_TEST_CONFIG
    )
  })

  // Feature: agent-desktop, Property 32: Capability-state resolution
  // Validates: Requirements 11.1
  it('resolves active only when fully enabled and a session is provisioned', () => {
    fc.assert(
      fc.property(capabilityInputArb, (input) => {
        const fullyEnabled =
          input.platformSupported && input.vdaAvailable && input.skillEnabled
        if (fullyEnabled && input.sessionActive) {
          expect(resolveAgentDesktopCapability(input)).toBe('active')
        } else {
          expect(resolveAgentDesktopCapability(input)).not.toBe('active')
        }
      }),
      PROPERTY_TEST_CONFIG
    )
  })

  // Feature: agent-desktop, Property 32: Capability-state resolution
  // Validates: Requirements 11.1
  it('resolves available only when fully enabled with no active session', () => {
    fc.assert(
      fc.property(capabilityInputArb, (input) => {
        const fullyEnabled =
          input.platformSupported && input.vdaAvailable && input.skillEnabled
        if (fullyEnabled && !input.sessionActive) {
          expect(resolveAgentDesktopCapability(input)).toBe('available')
        } else {
          expect(resolveAgentDesktopCapability(input)).not.toBe('available')
        }
      }),
      PROPERTY_TEST_CONFIG
    )
  })

  // Feature: agent-desktop, Property 32: Capability-state resolution
  // Validates: Requirements 8.5, 9.2
  it('lets unavailable conditions take precedence over an active session', () => {
    fc.assert(
      fc.property(
        // sessionActive is always true; at least one disabling condition holds.
        fc.record({
          platformSupported: fc.boolean(),
          vdaAvailable: fc.boolean(),
          skillEnabled: fc.boolean(),
        }).filter(
          ({ platformSupported, vdaAvailable, skillEnabled }) =>
            !platformSupported || !vdaAvailable || !skillEnabled
        ),
        (partial) => {
          const input: AgentDesktopCapabilityInput = { ...partial, sessionActive: true }
          expect(resolveAgentDesktopCapability(input)).toBe('unavailable')
        }
      ),
      PROPERTY_TEST_CONFIG
    )
  })
})

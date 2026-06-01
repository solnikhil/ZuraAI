import { describe, expect, it } from 'vitest'

import { AGENT_DESKTOP_CAPABILITY_DESCRIPTION } from './agentRun'

/**
 * Task 18.3 — input-session disclosure string.
 *
 * Requirement 3.10: THE Agent_Desktop_Service SHALL document, in the agent's
 * available capability description, that input is delivered only while the
 * Agent_Desktop is displayed because all Virtual_Desktops share one
 * Input_Session.
 *
 * _Requirements: 3.10_
 */
describe('AGENT_DESKTOP_CAPABILITY_DESCRIPTION (Req 3.10)', () => {
  it('states that input is delivered only while the Agent Desktop is displayed', () => {
    const normalized = AGENT_DESKTOP_CAPABILITY_DESCRIPTION.toLowerCase()

    // Must scope input delivery to the displayed desktop ("only while ... displayed").
    expect(normalized).toContain('only while')
    expect(normalized).toContain('displayed')
    expect(normalized).toMatch(/input.*only while.*displayed/s)
  })

  it('explains the cause: virtual desktops share a single input session', () => {
    const normalized = AGENT_DESKTOP_CAPABILITY_DESCRIPTION.toLowerCase()

    // Must mention the shared Input_Session rationale.
    expect(normalized).toContain('input session')
    expect(normalized).toContain('share')
    expect(normalized).toMatch(/virtual desktops.*share.*input session/s)
  })

  it('mentions the input action surface that is gated on display', () => {
    const normalized = AGENT_DESKTOP_CAPABILITY_DESCRIPTION.toLowerCase()

    // The description names the input actions delivered only while displayed.
    expect(normalized).toContain('input')
    for (const action of ['click', 'type', 'key', 'scroll', 'cursor']) {
      expect(normalized).toContain(action)
    }
  })

  it('is a non-empty, stable disclosure string', () => {
    expect(typeof AGENT_DESKTOP_CAPABILITY_DESCRIPTION).toBe('string')
    expect(AGENT_DESKTOP_CAPABILITY_DESCRIPTION.trim().length).toBeGreaterThan(0)
  })
})

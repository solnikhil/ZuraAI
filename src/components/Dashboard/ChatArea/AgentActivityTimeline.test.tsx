/**
 * Unit tests for the Agent Desktop (Agent View) presence surface rendered by
 * `AgentActivityTimeline` (Task 21.2).
 *
 * These cover the renderer behaviour for Requirements 11.4–11.9:
 *  - background presence → staging indicator + enabled Take_Over control,
 *    plus the "waiting for Take_Over" indicator while input cannot be delivered
 *    (Req 11.4, 11.5, 11.8).
 *  - take-over presence → actively-driving indicator + enabled
 *    return-to-User_Desktop control (Req 11.6, 11.7).
 *  - unavailable state → the unavailable surface shown in place of any
 *    Agent_Desktop control (Req 11.9).
 *
 * The optional `agentDesktopState` prop is authoritative when provided, so each
 * surface is driven deterministically without the Electron bridge. The
 * `window.agentDesktop` bridge is mocked only to assert the Take_Over / Return
 * controls invoke it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { AgentRun } from '@/chat/types'
import type { AgentDesktopState } from '@/electron/types'
import { createAgentRun } from '@/agent/agentRun'

import { AgentActivityTimeline } from './AgentActivityTimeline'

/**
 * Build an Agent_Run whose Agent_Desktop capability resolves to a usable state
 * (`active`) so the presence panel is not short-circuited by the capability
 * being `unavailable`. Individual tests still drive the surface via the
 * authoritative `agentDesktopState` override.
 */
function makeActiveRun(): AgentRun {
  return createAgentRun('agent', {
    platformSupported: true,
    vdaAvailable: true,
    skillEnabled: true,
    sessionActive: true,
  })
}

/**
 * Build an Agent_Run whose Agent_Desktop capability resolves to `unavailable`
 * (skill disabled), mirroring a VDA failure / macOS posture.
 */
function makeUnavailableRun(): AgentRun {
  return createAgentRun('agent', {
    platformSupported: false,
    vdaAvailable: false,
    skillEnabled: false,
    sessionActive: false,
  })
}

function makeState(overrides: Partial<AgentDesktopState> = {}): AgentDesktopState {
  return {
    platformSupported: true,
    vdaOutcome: 'available',
    capability: 'active',
    enabled: true,
    disclosureAcknowledged: true,
    presence: 'background',
    agentDesktopDisplayed: false,
    actionCount: 0,
    maxActions: 50,
    pendingApprovalCount: 0,
    lastError: null,
    ...overrides,
  }
}

let takeOver: ReturnType<typeof vi.fn>
let endTakeOver: ReturnType<typeof vi.fn>

beforeEach(() => {
  takeOver = vi.fn(async () => ({ ok: true, state: makeState({ presence: 'take-over' }) }))
  endTakeOver = vi.fn(async () => ({ ok: true, state: makeState({ presence: 'background' }) }))

  Object.defineProperty(window, 'agentDesktop', {
    value: { takeOver, endTakeOver },
    configurable: true,
    writable: true,
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('AgentActivityTimeline — background presence (Req 11.4, 11.5, 11.8)', () => {
  it('shows the staging indicator and an enabled Take Over control', () => {
    render(
      <AgentActivityTimeline
        run={makeActiveRun()}
        agentDesktopState={makeState({ presence: 'background', agentDesktopDisplayed: true })}
      />
    )

    expect(screen.getByText('Staging work on the separate desktop')).toBeInTheDocument()

    const takeOverButton = screen.getByRole('button', { name: /take over/i })
    expect(takeOverButton).toBeInTheDocument()
    expect(takeOverButton).not.toBeDisabled()

    // No "Return to my desktop" control while in background.
    expect(screen.queryByRole('button', { name: /return to my desktop/i })).toBeNull()
  })

  it('shows the "waiting for Take_Over" indicator when the Agent Desktop is not displayed', () => {
    render(
      <AgentActivityTimeline
        run={makeActiveRun()}
        agentDesktopState={makeState({ presence: 'background', agentDesktopDisplayed: false })}
      />
    )

    expect(screen.getByText('Staging work on the separate desktop')).toBeInTheDocument()
    expect(screen.getByText(/Waiting for Take Over to deliver input/i)).toBeInTheDocument()
  })

  it('hides the "waiting for Take_Over" indicator once the Agent Desktop is displayed', () => {
    render(
      <AgentActivityTimeline
        run={makeActiveRun()}
        agentDesktopState={makeState({ presence: 'background', agentDesktopDisplayed: true })}
      />
    )

    expect(screen.queryByText(/Waiting for Take Over to deliver input/i)).toBeNull()
  })

  it('invokes the Agent Desktop bridge when Take Over is clicked', async () => {
    render(
      <AgentActivityTimeline
        run={makeActiveRun()}
        agentDesktopState={makeState({ presence: 'background', agentDesktopDisplayed: false })}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /take over/i }))

    await waitFor(() => {
      expect(takeOver).toHaveBeenCalledTimes(1)
    })
    expect(endTakeOver).not.toHaveBeenCalled()
  })
})

describe('AgentActivityTimeline — take-over presence (Req 11.6, 11.7)', () => {
  it('shows the actively-driving indicator and an enabled Return control', () => {
    render(
      <AgentActivityTimeline
        run={makeActiveRun()}
        agentDesktopState={makeState({ presence: 'take-over', agentDesktopDisplayed: true })}
      />
    )

    expect(screen.getByText('Actively driving the separate desktop')).toBeInTheDocument()

    const returnButton = screen.getByRole('button', { name: /return to my desktop/i })
    expect(returnButton).toBeInTheDocument()
    expect(returnButton).not.toBeDisabled()

    // The Take Over control is replaced by the Return control in take-over.
    expect(screen.queryByRole('button', { name: /take over/i })).toBeNull()
    expect(screen.queryByText('Staging work on the separate desktop')).toBeNull()
  })

  it('invokes the Agent Desktop bridge when Return is clicked', async () => {
    render(
      <AgentActivityTimeline
        run={makeActiveRun()}
        agentDesktopState={makeState({ presence: 'take-over', agentDesktopDisplayed: true })}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /return to my desktop/i }))

    await waitFor(() => {
      expect(endTakeOver).toHaveBeenCalledTimes(1)
    })
    expect(takeOver).not.toHaveBeenCalled()
  })
})

describe('AgentActivityTimeline — unavailable surface (Req 11.9)', () => {
  it('shows the unavailable surface in place of controls when the VDA binding is unavailable', () => {
    render(
      <AgentActivityTimeline
        run={makeActiveRun()}
        agentDesktopState={makeState({ vdaOutcome: 'unavailable', presence: 'background' })}
      />
    )

    expect(screen.getByText('Separate desktop unavailable')).toBeInTheDocument()

    // No Agent_Desktop controls or presence indicators are rendered.
    expect(screen.queryByRole('button', { name: /take over/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /return to my desktop/i })).toBeNull()
    expect(screen.queryByText('Staging work on the separate desktop')).toBeNull()
    expect(screen.queryByText('Actively driving the separate desktop')).toBeNull()
  })

  it('shows the unavailable surface when the host platform is not supported (macOS)', () => {
    render(
      <AgentActivityTimeline
        run={makeActiveRun()}
        agentDesktopState={makeState({
          platformSupported: false,
          capability: 'unavailable',
          presence: null,
        })}
      />
    )

    expect(screen.getByText('Separate desktop unavailable')).toBeInTheDocument()
    expect(screen.getByText(/Separate desktop control runs only on Windows/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /take over/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /return to my desktop/i })).toBeNull()
  })

  it('shows the unavailable surface when the run capability itself is unavailable', () => {
    render(
      <AgentActivityTimeline
        run={makeUnavailableRun()}
        // Even with a usable-looking state, an unavailable run capability wins.
        agentDesktopState={makeState({ presence: 'take-over', agentDesktopDisplayed: true })}
      />
    )

    expect(screen.getByText('Separate desktop unavailable')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /take over/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /return to my desktop/i })).toBeNull()
  })

  it('surfaces a recorded error message when present', () => {
    render(
      <AgentActivityTimeline
        run={makeActiveRun()}
        agentDesktopState={makeState({
          capability: 'unavailable',
          lastError: 'VirtualDesktopAccessor failed to load',
        })}
      />
    )

    expect(screen.getByText('VirtualDesktopAccessor failed to load')).toBeInTheDocument()
  })
})

describe('AgentActivityTimeline — no presence surface', () => {
  it('renders no presence surface when there is no live state', () => {
    render(<AgentActivityTimeline run={makeActiveRun()} agentDesktopState={null} />)

    expect(screen.queryByText('Staging work on the separate desktop')).toBeNull()
    expect(screen.queryByText('Actively driving the separate desktop')).toBeNull()
    expect(screen.queryByText('Separate desktop unavailable')).toBeNull()
  })

  it('renders no presence surface when the capability is available but no session is active', () => {
    render(
      <AgentActivityTimeline
        run={makeActiveRun()}
        agentDesktopState={makeState({ capability: 'available', presence: null })}
      />
    )

    expect(screen.queryByText('Staging work on the separate desktop')).toBeNull()
    expect(screen.queryByText('Actively driving the separate desktop')).toBeNull()
    expect(screen.queryByText('Separate desktop unavailable')).toBeNull()
    expect(screen.queryByRole('button', { name: /take over/i })).toBeNull()
  })

  it('does not show separate-desktop unavailable state when this-desktop mode is selected', () => {
    render(
      <AgentActivityTimeline
        run={makeUnavailableRun()}
        agentDesktopState={makeState({
          enabled: false,
          capability: 'unavailable',
          vdaOutcome: 'unavailable',
          presence: null,
        })}
      />
    )

    expect(screen.queryByText('Separate desktop unavailable')).toBeNull()
    expect(screen.queryByText('Separate Desktop')).toBeNull()
  })
})

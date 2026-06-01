import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, waitFor } from '@testing-library/react'

import AgentDesktopSync from './AgentDesktopSync'
import { createDefaultAgentDesktopSettings } from '../settings/agentDesktopSettings'
import type { AgentDesktopSettings, AgentDesktopState } from '../electron/types'

// SETTINGS_MIRROR_TIMEOUT_MS (1000ms) is the upper bound within which a
// preference change must be mirrored into the service (Req 10.6). The effect
// fires synchronously after commit, so it is well inside this window.
const SETTINGS_MIRROR_TIMEOUT_MS = 1000

// --- Controllable platform mock ---------------------------------------------
let isWindows = true
vi.mock('../utils/platform', () => ({
  isWindowsRuntime: () => isWindows,
  isMacOSRuntime: () => !isWindows,
}))

// --- Controllable settings mock ---------------------------------------------
// `useSettings` is read by the component; we expose a mutable holder so a test
// can swap `settings.agentDesktop` and re-render to simulate a preference
// change.
const mockSettings: { settings: { agentDesktop?: AgentDesktopSettings } } = {
  settings: { agentDesktop: createDefaultAgentDesktopSettings() },
}
vi.mock('../contexts/SettingsContext', () => ({
  useSettings: () => mockSettings,
}))

// --- window.agentDesktop bridge stub ----------------------------------------
function buildState(): AgentDesktopState {
  return {
    platformSupported: true,
    vdaOutcome: 'available',
    capability: 'available',
    enabled: false,
    disclosureAcknowledged: false,
    presence: null,
    agentDesktopDisplayed: false,
    actionCount: 0,
    maxActions: 50,
    pendingApprovalCount: 0,
    lastError: null,
  }
}

let applySettings: ReturnType<typeof vi.fn>

function installBridge() {
  applySettings = vi.fn(async () => buildState())
  ;(window as unknown as { agentDesktop: { applySettings: typeof applySettings } }).agentDesktop = {
    applySettings,
  }
}

function removeBridge() {
  delete (window as unknown as { agentDesktop?: unknown }).agentDesktop
}

describe('AgentDesktopSync', () => {
  beforeEach(() => {
    isWindows = true
    mockSettings.settings = { agentDesktop: createDefaultAgentDesktopSettings() }
    installBridge()
  })

  afterEach(() => {
    cleanup()
    removeBridge()
    vi.clearAllMocks()
  })

  it('mirrors settings.agentDesktop into the service on mount (Windows)', () => {
    render(<AgentDesktopSync />)

    expect(applySettings).toHaveBeenCalledTimes(1)
    expect(applySettings).toHaveBeenCalledWith(mockSettings.settings.agentDesktop)
  })

  it('calls applySettings again when the preference changes within the mirror window', async () => {
    const start = performance.now()
    const { rerender } = render(<AgentDesktopSync />)

    // Initial mount mirror.
    expect(applySettings).toHaveBeenCalledTimes(1)

    // Simulate a preference change: a NEW object identity is required because
    // the effect is keyed on `settings.agentDesktop`.
    const changed: AgentDesktopSettings = {
      ...createDefaultAgentDesktopSettings(),
      enabled: true,
      disclosureAcknowledged: true,
      persistence: 'persist',
      approvalTimeoutMs: 120_000,
    }
    mockSettings.settings = { agentDesktop: changed }

    act(() => {
      rerender(<AgentDesktopSync />)
    })

    await waitFor(() => {
      expect(applySettings).toHaveBeenCalledTimes(2)
    })

    // The mirror happened well within SETTINGS_MIRROR_TIMEOUT_MS (Req 10.6).
    expect(performance.now() - start).toBeLessThan(SETTINGS_MIRROR_TIMEOUT_MS)
    expect(applySettings).toHaveBeenLastCalledWith(changed)
  })

  it('does not re-mirror when the preference object identity is unchanged', () => {
    const { rerender } = render(<AgentDesktopSync />)
    expect(applySettings).toHaveBeenCalledTimes(1)

    // Re-render without changing the `agentDesktop` reference: the effect key
    // is stable, so no additional mirror should occur.
    act(() => {
      rerender(<AgentDesktopSync />)
    })

    expect(applySettings).toHaveBeenCalledTimes(1)
  })

  it('does not call applySettings on macOS / non-Windows platforms', () => {
    isWindows = false

    render(<AgentDesktopSync />)

    expect(applySettings).not.toHaveBeenCalled()
  })

  it('does not call applySettings when settings.agentDesktop is undefined', () => {
    mockSettings.settings = { agentDesktop: undefined }

    render(<AgentDesktopSync />)

    expect(applySettings).not.toHaveBeenCalled()
  })

  it('no-ops when the window.agentDesktop bridge is absent', () => {
    removeBridge()

    expect(() => render(<AgentDesktopSync />)).not.toThrow()
  })
})

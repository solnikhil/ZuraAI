/**
 * Smoke tests — Agent Desktop persistence location + AGENTS.md doc-compliance.
 *
 * Task 24.2 (agent-desktop spec).
 *
 * Two concerns are covered here:
 *
 * 1. Persistence location (Req 10.1): Agent Desktop preferences MUST live inside
 *    the existing sanitized renderer settings blob (`zura-settings` in
 *    localStorage) under `settings.agentDesktop` — NOT in a new secure-storage
 *    entry and NOT in a separate Agent Desktop preferences file. These tests
 *    assert that `settings.agentDesktop` round-trips through the renderer
 *    settings store, that it is preserved by secret-sanitization (proving it is
 *    a non-secret part of the persisted blob), that the secure-storage allowlist
 *    introduces no Agent Desktop key, and that the `electron/agentDesktop/`
 *    module persists nothing to disk on its own.
 *
 * 2. Documentation checklist (Req 13.1–13.4): the AGENTS.md Architecture section
 *    MUST document the Agent Desktop feature — the `electron/agentDesktop/`
 *    module, the `window.agentDesktop` bridge / `agent-desktop:*` IPC channels,
 *    the Windows-only gating, and the VDA_Binding graceful-degradation behavior.
 *    These assertions are pinned to strings genuinely present in AGENTS.md so
 *    the doc-compliance gate is robust rather than aspirational.
 *
 * **Validates: Requirements 10.1, 13.1, 13.2, 13.3, 13.4**
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

import {
  normalizeStoredSettings,
  parseStoredSettings,
  stripSecretSettings,
} from '../contexts/settingsStore'
import type { AgentDesktopSettings } from '../electron/types'

// Repo root: this test lives in src/__tests__/, so ../../ resolves to the root.
const ROOT = path.resolve(__dirname, '..', '..')

function readProjectFile(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf-8')
}

/**
 * Strip block (`/* ... *​/`) and line (`// ...`) comments so persistence-signal
 * scans target real code side-effects, not explanatory prose. The Agent Desktop
 * modules document the "lives in zura-settings, not localStorage / not a file"
 * design in comments, which must not be mistaken for actual persistence code.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** A complete, well-formed Agent Desktop preferences blob for round-trip tests. */
const SAMPLE_AGENT_DESKTOP: AgentDesktopSettings = {
  enabled: true,
  disclosureAcknowledged: true,
  persistence: 'persist',
  approvalPolicy: {
    screenshot: 'auto-approve',
    click: 'approval-required',
    type: 'approval-required',
    key: 'approval-required',
    scroll: 'approval-required',
    cursor_position: 'auto-approve',
    list_windows: 'auto-approve',
    launch_app: 'approval-required',
    close_app: 'approval-required',
    find_app: 'auto-approve',
  },
  approvalTimeoutMs: 60_000,
}

// ────────────────────────────────────────────────────────────────────────────
// Part 1 — Persistence location: lives in `zura-settings`, no new file
// ────────────────────────────────────────────────────────────────────────────

describe('Agent Desktop persistence location (Req 10.1)', () => {
  it('round-trips settings.agentDesktop through the zura-settings blob', () => {
    // Simulate what the renderer writes to localStorage['zura-settings'].
    const stored = JSON.stringify({ agentDesktop: SAMPLE_AGENT_DESKTOP })

    const normalized = normalizeStoredSettings(stored)

    // The Agent Desktop preferences survive within the single settings blob —
    // they are not split out into a separate store or dropped.
    expect(normalized.agentDesktop).toEqual(SAMPLE_AGENT_DESKTOP)
  })

  it('keeps settings.agentDesktop in the sanitized (non-secret) settings blob', () => {
    // stripSecretSettings is the gate applied before persisting to localStorage:
    // it removes secret API keys but must retain non-secret preferences like
    // agentDesktop. If agentDesktop were ever treated as a secret, it would be
    // stripped here and would need a separate store — which Req 10.1 forbids.
    const sanitized = stripSecretSettings({
      agentDesktop: SAMPLE_AGENT_DESKTOP,
      openRouterApiKey: 'sk-secret-should-be-stripped',
    } as Record<string, unknown>)

    expect(sanitized.agentDesktop).toEqual(SAMPLE_AGENT_DESKTOP)
    // Sanity check: a real secret IS stripped, proving the sanitizer is active.
    expect(sanitized.openRouterApiKey).toBeUndefined()
  })

  it('parseStoredSettings preserves agentDesktop while stripping secrets', () => {
    const parsed = parseStoredSettings(
      JSON.stringify({
        agentDesktop: SAMPLE_AGENT_DESKTOP,
        openRouterApiKey: 'sk-secret',
      })
    )

    expect(parsed.agentDesktop).toEqual(SAMPLE_AGENT_DESKTOP)
    expect((parsed as Record<string, unknown>).openRouterApiKey).toBeUndefined()
  })

  it('introduces no Agent Desktop entry in the secure-storage allowlist', () => {
    // The secure-storage IPC boundary has an explicit, narrow allowlist. Agent
    // Desktop preferences are non-secret and must NOT appear here (no new
    // secure-storage entry per Req 10.1).
    const handlersSource = readProjectFile('electron/ipc/secureStorageHandlers.ts')
    const secureStorageSource = readProjectFile('electron/secureStorage.ts')

    for (const source of [handlersSource, secureStorageSource]) {
      expect(source).not.toMatch(/agentDesktop/i)
      expect(source).not.toMatch(/agent-desktop/i)
    }
  })

  it('does not introduce a dedicated Agent Desktop preferences file', () => {
    // The main-process Agent Desktop module holds runtime state in memory and
    // receives preferences mirrored from the renderer's zura-settings blob. It
    // must not write its own persistence file or touch secure storage. Scan all
    // non-test source modules under electron/agentDesktop/ for persistence
    // side-effects.
    const moduleDir = path.join(ROOT, 'electron', 'agentDesktop')
    const sourceFiles = fs
      .readdirSync(moduleDir)
      .filter((name) => name.endsWith('.ts') && !name.includes('.test.'))

    expect(sourceFiles.length).toBeGreaterThan(0)

    const persistenceSignals = [
      'app.getPath',
      'getPath(',
      'writeFile',
      'writeFileAtomic',
      'readFileSync',
      'secure-storage',
      'secureStorage',
      'localStorage',
    ]

    for (const fileName of sourceFiles) {
      // Strip comments first: the modules document the "no new file / not
      // localStorage" design in prose, which must not trip a substring scan.
      const source = stripComments(fs.readFileSync(path.join(moduleDir, fileName), 'utf-8'))
      for (const signal of persistenceSignals) {
        expect(
          source.includes(signal),
          `electron/agentDesktop/${fileName} unexpectedly references "${signal}" in code — Agent Desktop must not introduce its own persistence (Req 10.1)`
        ).toBe(false)
      }
    }
  })
})

// ────────────────────────────────────────────────────────────────────────────
// Part 2 — Documentation checklist: AGENTS.md Architecture is updated
// ────────────────────────────────────────────────────────────────────────────

describe('AGENTS.md Architecture documents Agent Desktop (Req 13.1–13.4)', () => {
  const agentsMd = readProjectFile('AGENTS.md')

  /**
   * Slice the Architecture section so doc-compliance assertions are scoped to
   * the section Req 13 actually governs, not the file at large.
   */
  function architectureSection(): string {
    const start = agentsMd.indexOf('## Architecture')
    expect(start, 'AGENTS.md should contain an "## Architecture" section').toBeGreaterThan(-1)
    const end = agentsMd.indexOf('## Agent Best Practices', start)
    return agentsMd.slice(start, end === -1 ? undefined : end)
  }

  const architecture = architectureSection()

  it('documents the electron/agentDesktop/ module and its responsibilities (Req 13.2)', () => {
    expect(architecture).toContain('Agent Desktop / Agent View')
    expect(architecture).toContain('electron/agentDesktop/')
    // The orchestration entry point and gate responsibility are named.
    expect(architecture).toContain('AgentDesktopService')
    expect(architecture).toContain('gateComputerAction')
  })

  it('documents the window.agentDesktop bridge and agent-desktop:* IPC channels (Req 13.2)', () => {
    expect(architecture).toContain('window.agentDesktop')

    const invokeChannels = [
      'agent-desktop:get-state',
      'agent-desktop:apply-settings',
      'agent-desktop:take-over',
      'agent-desktop:end-take-over',
      'agent-desktop:resolve-approval',
      'agent-desktop:acknowledge-disclosure',
    ]
    const broadcastChannels = [
      'agent-desktop:state-changed',
      'agent-desktop:pending-approval',
      'agent-desktop:killed',
    ]

    for (const channel of [...invokeChannels, ...broadcastChannels]) {
      expect(architecture, `Architecture should document IPC channel ${channel}`).toContain(channel)
    }
  })

  it('documents the Windows-only gating and non-Windows behavior (Req 13.2)', () => {
    expect(architecture).toContain('Windows-only gating')
    // Mirrors Computer Use: registration gate + defense-in-depth macOS rejection.
    expect(architecture).toContain('registerAgentDesktopHandlers()')
    expect(architecture).toMatch(/darwin/)
  })

  it('documents the VDA_Binding dependency and graceful-degradation behavior (Req 13.3)', () => {
    expect(architecture).toContain('VDA_Binding')
    expect(architecture).toContain('VirtualDesktopAccessor')
    expect(architecture).toMatch(/graceful degradation/i)
    // Which capabilities stay available vs disabled when VDA is unavailable.
    expect(architecture).toContain('only the Agent Desktop capability is disabled')
    expect(architecture).toContain('all other application capabilities stay operational')
    // And the never-fall-back-to-User_Desktop guarantee.
    expect(architecture).toContain('never falls back to performing agent actions on the User_Desktop')
  })

  it('documents that settings.agentDesktop lives in zura-settings with no new file (Req 13.1, 10.1)', () => {
    expect(architecture).toContain('settings.agentDesktop')
    expect(architecture).toContain('zura-settings')
    expect(architecture).toContain('no new file, no secure storage')
  })

  it('documents the same-change-set Architecture update requirement (Req 13.4)', () => {
    // AGENTS.md states the doc-compliance gate up front and again as a dedicated
    // section, which is what blocks acceptance of an undocumented change set.
    expect(agentsMd).toContain('Hard requirement:')
    expect(agentsMd).toContain('## When to Update the Architecture Section')
  })
})

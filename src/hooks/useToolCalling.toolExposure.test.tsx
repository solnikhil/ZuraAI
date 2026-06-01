import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fc from 'fast-check'
import { cleanup, renderHook } from '@testing-library/react'

import {
  defaultSkillsSettings,
  withAgentDesktopEnabled,
  withComputerUseEnabled,
  type SkillsSettings,
} from '../skills'
import { getBuiltinToolDefinitions } from '../tools/definitions'

/**
 * Tool exposure gating for Agent Desktop (Agent View) — Task 22.2.
 *
 * Validates Requirements 9.3 and 10.9:
 *  - 10.9: WHILE the Agent_Desktop_Skill is disabled, the system SHALL NOT
 *    expose Agent_Desktop actions to the agent.
 *  - 9.3: WHERE IS_MACOS is true, the system SHALL NOT render / expose
 *    Agent_Desktop controls (the renderer mirrors the Windows-only gate).
 *
 * Agent Desktop does not introduce new model-callable tools; it reuses the
 * existing Computer Use action surface (`computer_*`). So "exposing the Agent
 * Desktop surface" means exposing those `computer_*` tools to the model. This
 * suite asserts that surface is exposed only on Windows when the skill is
 * enabled, and never on macOS or when the skill is disabled.
 */

// --- Controllable platform mock ---------------------------------------------
let isWindows = true
vi.mock('../utils/platform', () => ({
  isWindowsRuntime: () => isWindows,
  isMacOSRuntime: () => !isWindows,
}))

// --- Controllable settings mock ---------------------------------------------
interface MockSettingsShape {
  toolsEnabled: boolean
  assistantMode: 'chat' | 'agent'
  enabledTools: string[]
  skills: SkillsSettings
  modelProvider: string
  aiModel: string
  configuredModels: Array<{ code: string; displayName: string; supportsToolCall?: boolean }>
}

const mockSettings: { settings: MockSettingsShape } = {
  settings: makeSettings(),
}
vi.mock('../contexts/SettingsContext', () => ({
  useSettings: () => mockSettings,
}))

// --- MCP context is optional; no MCP tools for these tests ------------------
vi.mock('../mcp/McpContext', () => ({
  useOptionalMcp: () => undefined,
}))

// Import the hook AFTER the mocks are registered.
import { useToolCalling } from './useToolCalling'

/**
 * Build a tool-capable settings object in agent mode. A tool-supporting
 * provider/model is required so `getToolsForRequest()` returns a real tool
 * array we can inspect rather than null.
 */
function makeSettings(overrides: Partial<MockSettingsShape> = {}): MockSettingsShape {
  return {
    toolsEnabled: true,
    assistantMode: 'agent',
    enabledTools: ['web_search'],
    skills: defaultSkillsSettings,
    modelProvider: 'openrouter',
    aiModel: 'openai/gpt-4o',
    configuredModels: [
      { code: 'openai/gpt-4o', displayName: 'GPT-4o', supportsToolCall: true },
    ],
    ...overrides,
  }
}

// The Computer Use action surface, derived from the shared built-in tool
// manifest so the expectation tracks the real set rather than a hand-copied
// list.
const COMPUTER_USE_TOOL_NAMES = getBuiltinToolDefinitions()
  .filter((tool) => tool.category === 'computer-use')
  .map((tool) => tool.name)

function getExposedToolNames(): string[] {
  const { result } = renderHook(() => useToolCalling())
  const tools = result.current.getToolsForRequest()
  return (tools ?? []).map((tool) => tool.function.name)
}

function exposesComputerUseSurface(): boolean {
  const names = getExposedToolNames()
  return COMPUTER_USE_TOOL_NAMES.some((name) => names.includes(name))
}

beforeEach(() => {
  isWindows = true
  mockSettings.settings = makeSettings()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('useToolCalling — Agent Desktop tool exposure gating (Req 9.3, 10.9)', () => {
  it('sanity: derives a non-empty Computer Use surface from the manifest', () => {
    expect(COMPUTER_USE_TOOL_NAMES.length).toBeGreaterThan(0)
    expect(COMPUTER_USE_TOOL_NAMES).toContain('computer_screenshot')
    expect(COMPUTER_USE_TOOL_NAMES).toContain('computer_click')
  })

  it('exposes the Computer Use surface on Windows when the Agent Desktop skill is enabled', () => {
    isWindows = true
    mockSettings.settings = makeSettings({
      skills: withAgentDesktopEnabled(defaultSkillsSettings, true),
    })

    const names = getExposedToolNames()
    for (const tool of COMPUTER_USE_TOOL_NAMES) {
      expect(names).toContain(tool)
    }
    // The rest of the agent-mode surface is still present.
    expect(names).toContain('web_search')
  })

  it('does NOT expose the Computer Use surface on Windows when the skill is disabled (Req 10.9)', () => {
    isWindows = true
    // Default skills have both agent_desktop and computer_use disabled.
    mockSettings.settings = makeSettings({ skills: defaultSkillsSettings })

    const names = getExposedToolNames()
    for (const tool of COMPUTER_USE_TOOL_NAMES) {
      expect(names).not.toContain(tool)
    }
    // Non-Agent-Desktop tools remain available, so the agent still has a surface.
    expect(names).toContain('web_search')
  })

  it('does NOT expose the Computer Use surface on macOS even when the Agent Desktop skill is enabled (Req 9.3)', () => {
    isWindows = false
    mockSettings.settings = makeSettings({
      skills: withAgentDesktopEnabled(defaultSkillsSettings, true),
    })

    const names = getExposedToolNames()
    for (const tool of COMPUTER_USE_TOOL_NAMES) {
      expect(names).not.toContain(tool)
    }
    expect(names).toContain('web_search')
  })

  it('does NOT expose the Computer Use surface in chat mode even on Windows with the skill enabled', () => {
    isWindows = true
    mockSettings.settings = makeSettings({
      assistantMode: 'chat',
      skills: withAgentDesktopEnabled(defaultSkillsSettings, true),
    })

    const names = getExposedToolNames()
    for (const tool of COMPUTER_USE_TOOL_NAMES) {
      expect(names).not.toContain(tool)
    }
  })

  it('still exposes the Computer Use surface on Windows via the standalone Computer Use skill', () => {
    // Agent Desktop reuses the same surface; enabling the standalone Computer
    // Use skill must continue to expose it so that feature is not regressed.
    isWindows = true
    mockSettings.settings = makeSettings({
      skills: withComputerUseEnabled(defaultSkillsSettings, true),
    })

    const names = getExposedToolNames()
    for (const tool of COMPUTER_USE_TOOL_NAMES) {
      expect(names).toContain(tool)
    }
  })

  it('exposes non-desktop tools (web_search, code_execution) in chat mode', () => {
    isWindows = true
    mockSettings.settings = makeSettings({
      assistantMode: 'chat',
      skills: defaultSkillsSettings,
    })

    const names = getExposedToolNames()
    expect(names).toContain('web_search')
    expect(names).toContain('code_execution')
    for (const tool of COMPUTER_USE_TOOL_NAMES) {
      expect(names).not.toContain(tool)
    }
  })

  /**
   * Property: in agent mode, the Computer Use surface is exposed if and only if
   * the runtime is Windows AND (the Agent Desktop skill OR the standalone
   * Computer Use skill) is enabled. Holds across every platform/skill combo.
   */
  it('Property: exposure iff Windows AND (agent_desktop OR computer_use) skill enabled', () => {
    fc.assert(
      fc.property(
        fc.boolean(), // windows
        fc.boolean(), // agentDesktopEnabled
        fc.boolean(), // computerUseEnabled
        (windows, agentDesktopEnabled, computerUseEnabled) => {
          isWindows = windows
          let skills = withAgentDesktopEnabled(defaultSkillsSettings, agentDesktopEnabled)
          skills = withComputerUseEnabled(skills, computerUseEnabled)
          mockSettings.settings = makeSettings({ skills })

          const exposed = exposesComputerUseSurface()
          cleanup()

          const expected = windows && (agentDesktopEnabled || computerUseEnabled)
          expect(exposed).toBe(expected)
          return exposed === expected
        }
      ),
      { numRuns: 100 }
    )
  })
})

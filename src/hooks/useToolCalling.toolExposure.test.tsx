import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fc from 'fast-check'
import { cleanup, renderHook } from '@testing-library/react'

import {
  defaultSkillsSettings,
  withComputerUseEnabled,
  withTerminalEnabled,
  type SkillsSettings,
} from '../skills'
import { getBuiltinToolDefinitions } from '../tools/definitions'

let isWindows = true
vi.mock('../utils/platform', () => ({
  isWindowsRuntime: () => isWindows,
  isMacOSRuntime: () => !isWindows,
}))

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

vi.mock('../mcp/McpContext', () => ({
  useOptionalMcp: () => undefined,
}))

import { useToolCalling } from './useToolCalling'

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

const COMPUTER_USE_TOOL_NAMES = getBuiltinToolDefinitions()
  .filter((tool) => tool.category === 'computer-use')
  .map((tool) => tool.name)

const NATIVE_WINDOWS_TOOL_NAMES = [
  'file_search',
  'file_read',
  'file_write',
  'file_move',
  'app_find',
  'app_list',
  'app_launch',
  'window_list',
  'window_focus',
  'windows_uia_snapshot',
]

const SCHEDULED_TASK_TOOL_NAMES = [
  'scheduled_task_create',
  'scheduled_task_update',
  'scheduled_task_delete',
  'scheduled_task_list',
  'scheduled_task_get_logs',
]

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

describe('useToolCalling - Computer Use tool exposure gating', () => {
  it('sanity: derives a non-empty Computer Use surface from the manifest', () => {
    expect(COMPUTER_USE_TOOL_NAMES.length).toBeGreaterThan(0)
    expect(COMPUTER_USE_TOOL_NAMES).toContain('computer_screenshot')
    expect(COMPUTER_USE_TOOL_NAMES).toContain('computer_click')
  })

  it('exposes the Computer Use surface on Windows when the Computer Use skill is enabled', () => {
    isWindows = true
    mockSettings.settings = makeSettings({
      skills: withComputerUseEnabled(defaultSkillsSettings, true),
    })

    const names = getExposedToolNames()
    for (const tool of COMPUTER_USE_TOOL_NAMES) {
      expect(names).toContain(tool)
    }
    expect(names).toContain('web_search')
  })

  it('does not expose the Computer Use surface on Windows when the skill is disabled', () => {
    isWindows = true
    mockSettings.settings = makeSettings({ skills: defaultSkillsSettings })

    const names = getExposedToolNames()
    for (const tool of COMPUTER_USE_TOOL_NAMES) {
      expect(names).not.toContain(tool)
    }
    expect(names).toContain('web_search')
  })

  it('exposes native Windows Agent tools in agent mode even when persisted enabledTools is stale', () => {
    isWindows = true
    mockSettings.settings = makeSettings({
      enabledTools: ['web_search'],
      skills: defaultSkillsSettings,
    })

    const names = getExposedToolNames()
    for (const tool of NATIVE_WINDOWS_TOOL_NAMES) {
      expect(names).toContain(tool)
    }
    expect(names).toContain('web_search')
  })

  it('orders native Windows Agent tools before Computer Use fallback tools', () => {
    isWindows = true
    mockSettings.settings = makeSettings({
      enabledTools: ['web_search'],
      skills: withComputerUseEnabled(defaultSkillsSettings, true),
    })

    const names = getExposedToolNames()
    expect(names.indexOf('file_search')).toBeGreaterThanOrEqual(0)
    expect(names.indexOf('computer_screenshot')).toBeGreaterThanOrEqual(0)
    expect(names.indexOf('file_search')).toBeLessThan(names.indexOf('computer_screenshot'))
  })

  it('does not expose the Computer Use surface on macOS even when the Computer Use skill is enabled', () => {
    isWindows = false
    mockSettings.settings = makeSettings({
      skills: withComputerUseEnabled(defaultSkillsSettings, true),
    })

    const names = getExposedToolNames()
    for (const tool of COMPUTER_USE_TOOL_NAMES) {
      expect(names).not.toContain(tool)
    }
    expect(names).toContain('web_search')
  })

  it('does not expose the Computer Use surface in chat mode even on Windows with the skill enabled', () => {
    isWindows = true
    mockSettings.settings = makeSettings({
      assistantMode: 'chat',
      skills: withComputerUseEnabled(defaultSkillsSettings, true),
    })

    const names = getExposedToolNames()
    for (const tool of COMPUTER_USE_TOOL_NAMES) {
      expect(names).not.toContain(tool)
    }
  })

  it('exposes non-desktop tools in chat mode', () => {
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

  it('Property: exposure iff Windows AND computer_use skill enabled', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        (windows, computerUseEnabled) => {
          isWindows = windows
          const skills = withComputerUseEnabled(defaultSkillsSettings, computerUseEnabled)
          mockSettings.settings = makeSettings({ skills })

          const exposed = exposesComputerUseSurface()
          cleanup()

          const expected = windows && computerUseEnabled
          expect(exposed).toBe(expected)
          return exposed === expected
        }
      ),
      { numRuns: 100 }
    )
  })
})

describe('useToolCalling - Terminal skill (system_shell) exposure gating', () => {
  it('does not expose system_shell when the Terminal skill is disabled (even in agent mode)', () => {
    isWindows = true
    mockSettings.settings = makeSettings({
      assistantMode: 'agent',
      skills: defaultSkillsSettings,
    })
    expect(getExposedToolNames()).not.toContain('system_shell')
  })

  it('exposes system_shell on Windows when the Terminal skill is enabled in agent mode', () => {
    isWindows = true
    mockSettings.settings = makeSettings({
      assistantMode: 'agent',
      skills: withTerminalEnabled(defaultSkillsSettings, true),
    })
    expect(getExposedToolNames()).toContain('system_shell')
  })

  it('exposes system_shell on Windows when the Terminal skill is enabled in chat mode', () => {
    isWindows = true
    mockSettings.settings = makeSettings({
      assistantMode: 'chat',
      skills: withTerminalEnabled(defaultSkillsSettings, true),
    })
    expect(getExposedToolNames()).toContain('system_shell')
  })

  it('does not expose system_shell on macOS even when the Terminal skill is enabled', () => {
    isWindows = false
    mockSettings.settings = makeSettings({
      assistantMode: 'agent',
      skills: withTerminalEnabled(defaultSkillsSettings, true),
    })
    expect(getExposedToolNames()).not.toContain('system_shell')
  })

  it('Property: system_shell exposure iff Windows AND terminal skill enabled', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.constantFrom('chat' as const, 'agent' as const),
        (windows, terminalEnabled, mode) => {
          isWindows = windows
          const skills = withTerminalEnabled(defaultSkillsSettings, terminalEnabled)
          mockSettings.settings = makeSettings({ assistantMode: mode, skills })

          const exposed = getExposedToolNames().includes('system_shell')
          cleanup()

          const expected = windows && terminalEnabled
          expect(exposed).toBe(expected)
          return exposed === expected
        }
      ),
      { numRuns: 100 }
    )
  })
})

describe('useToolCalling - Reminders skill scheduled task tool exposure gating', () => {
  it('does not expose scheduled task tools when the Reminders skill is disabled', () => {
    mockSettings.settings = makeSettings({ skills: defaultSkillsSettings })

    const names = getExposedToolNames()
    for (const tool of SCHEDULED_TASK_TOOL_NAMES) {
      expect(names).not.toContain(tool)
    }
  })

  it('exposes scheduled task tools when the Reminders skill is enabled', () => {
    mockSettings.settings = makeSettings({
      skills: {
        ...defaultSkillsSettings,
        reminders: { enabled: true },
      },
    })

    const names = getExposedToolNames()
    for (const tool of SCHEDULED_TASK_TOOL_NAMES) {
      expect(names).toContain(tool)
    }
  })
})

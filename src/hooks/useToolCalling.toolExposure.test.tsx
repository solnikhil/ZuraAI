import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fc from 'fast-check'
import { cleanup, renderHook } from '@testing-library/react'

import {
  defaultSkillsSettings,
  withCodeExecutionEnabled,
  withComputerUseEnabled,
  withTerminalEnabled,
  type SkillsSettings,
} from '../skills'
import type { AgentSkillsSettings } from '../agentSkills/types'
import { getBuiltinToolDefinitions } from '../tools/definitions'

let isWindows = true
const mockMcpContext = vi.hoisted(() => ({ value: undefined as unknown }))
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
  agentSkills: AgentSkillsSettings
  configuredModels: Array<{ code: string; displayName: string; supportsToolCall?: boolean }>
}

const mockSettings: { settings: MockSettingsShape } = {
  settings: makeSettings(),
}
vi.mock('../contexts/SettingsContext', () => ({
  useSettings: () => mockSettings,
}))

vi.mock('../mcp/McpContext', () => ({
  useOptionalMcp: () => mockMcpContext.value,
}))

import { useToolCalling } from './useToolCalling'

function makeSettings(overrides: Partial<MockSettingsShape> = {}): MockSettingsShape {
  return {
    toolsEnabled: true,
    assistantMode: 'agent',
    enabledTools: ['web_search'],
    skills: defaultSkillsSettings,
    agentSkills: {
      enabled: false,
      projectRoot: '',
      disabledSkillNames: [],
      catalog: [],
    },
    modelProvider: 'openrouter',
    aiModel: 'openai/gpt-4o',
    configuredModels: [{ code: 'openai/gpt-4o', displayName: 'GPT-4o', supportsToolCall: true }],
    ...overrides,
  }
}

// These Computer Use tools remain supported in main for reversibility but are
// intentionally not exposed to the model in agent mode (background-safe ui_*
// tools and window_list cover the same needs). Keep them out of the expected
// exposure surface.
const UNEXPOSED_COMPUTER_USE_TOOL_NAMES = [
  'computer_type',
  'computer_key',
  'computer_scroll',
  'computer_cursor_position',
  'computer_list_windows',
]

const COMPUTER_USE_TOOL_NAMES = getBuiltinToolDefinitions()
  .filter((tool) => tool.category === 'computer-use')
  .map((tool) => tool.name)
  .filter((name) => !UNEXPOSED_COMPUTER_USE_TOOL_NAMES.includes(name))

const DESKTOP_OS_TOOL_NAMES = [
  'system_active_window',
  'system_status',
  'system_settings_open',
  'system_open_path',
  'window_snap',
  'app_find',
  'app_list',
  'app_launch',
  'window_list',
  'window_focus',
]

const COMMAND_CENTER_SHARED_NATIVE_TOOL_NAMES = [
  'app_find',
  'app_list',
  'app_launch',
  'window_list',
  'window_focus',
]

const _DESKTOP_OS_EXCLUSIVE_TOOL_NAMES = DESKTOP_OS_TOOL_NAMES.filter(
  (tool) => !COMMAND_CENTER_SHARED_NATIVE_TOOL_NAMES.includes(tool)
)

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
]

const SCHEDULED_TASK_TOOL_NAMES = [
  'scheduled_task_create',
  'scheduled_task_update',
  'scheduled_task_delete',
  'scheduled_task_list',
  'scheduled_task_get_logs',
]

const ARTIFACT_TOOL_NAMES = ['artifact_create', 'artifact_update']

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
  mockMcpContext.value = undefined
  mockSettings.settings = makeSettings()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('useToolCalling - MCP registry hydration', () => {
  it('refreshes a pending MCP registry before building request tools', async () => {
    const refresh = vi.fn(async () => ({
      servers: [
        {
          id: 'server-1',
          name: 'Sequential Thinking',
          enabled: true,
          trustState: 'trusted',
          transport: 'stdio',
          requireApproval: true,
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      ],
      runtimeStates: [
        {
          serverId: 'server-1',
          status: 'connected',
          tools: [],
          capabilities: { tools: true, resources: false, prompts: false },
        },
      ],
      tools: [
        {
          namespacedName: 'mcp__sequential_thinking__sequentialthinking',
          serverId: 'server-1',
          serverName: 'Sequential Thinking',
          serverSlug: 'sequential_thinking',
          toolName: 'sequentialthinking',
          toolSlug: 'sequentialthinking',
          manifest: {
            name: 'sequentialthinking',
            description: 'Break down complex problems step by step',
            inputSchema: { type: 'object', properties: {}, required: [] },
          },
        },
      ],
      resources: [],
      prompts: [],
      pendingApprovals: [],
    }))

    mockMcpContext.value = {
      isSupported: true,
      isLoading: true,
      isRefreshing: false,
      servers: [],
      runtimeStates: [],
      tools: [],
      refresh,
    }

    const { result } = renderHook(() => useToolCalling())
    const tools = await result.current.getToolsForRequestAsync()

    expect(refresh).toHaveBeenCalledOnce()
    expect((tools ?? []).map((tool) => tool.function.name)).toContain(
      'mcp__sequential_thinking__sequentialthinking'
    )
  })
})

describe('useToolCalling - Computer Use tool exposure gating', () => {
  it('exposes enabled tools to ChatGPT Codex models', () => {
    mockSettings.settings = makeSettings({
      modelProvider: 'codex',
      aiModel: 'gpt-5.4',
    })

    expect(getExposedToolNames()).toContain('web_search')
  })

  it('sanity: derives a non-empty Computer Use surface from the manifest', () => {
    expect(COMPUTER_USE_TOOL_NAMES.length).toBeGreaterThan(0)
    expect(COMPUTER_USE_TOOL_NAMES).toContain('ui_get_app_state')
    expect(COMPUTER_USE_TOOL_NAMES).toContain('ui_click')
    expect(COMPUTER_USE_TOOL_NAMES).toContain('computer_screenshot')
    expect(COMPUTER_USE_TOOL_NAMES).toContain('computer_click')
    expect(COMPUTER_USE_TOOL_NAMES).toContain('background_window_attach')
    expect(COMPUTER_USE_TOOL_NAMES).toContain('background_window_status')
    expect(COMPUTER_USE_TOOL_NAMES).toContain('background_window_release')
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
    expect(names).not.toContain('windows_uia_snapshot')
    expect(names).not.toContain('windows_uia_invoke')
    expect(names).not.toContain('windows_uia_set_value')
    expect(names).not.toContain('windows_uia_select')
    expect(names).toContain('mcp_request_add')
    expect(names).toContain('web_search')
  })

  it('does not expose the MCP add request tool in chat mode', () => {
    mockSettings.settings = makeSettings({
      assistantMode: 'chat',
      enabledTools: ['web_search', 'mcp_request_add'],
    })

    expect(getExposedToolNames()).not.toContain('mcp_request_add')
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
    expect(names).not.toContain('code_execution')
    for (const tool of COMPUTER_USE_TOOL_NAMES) {
      expect(names).not.toContain(tool)
    }
  })

  it('Property: exposure iff Windows AND computer_use skill enabled', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (windows, computerUseEnabled) => {
        isWindows = windows
        const skills = withComputerUseEnabled(defaultSkillsSettings, computerUseEnabled)
        mockSettings.settings = makeSettings({ skills })

        const exposed = exposesComputerUseSurface()
        cleanup()

        const expected = windows && computerUseEnabled
        expect(exposed).toBe(expected)
        return exposed === expected
      }),
      { numRuns: 100 }
    )
  })
})

describe('useToolCalling - desktop OS integration exposure gating', () => {
  it('exposes OS integration tools on Windows in Agent Mode', () => {
    isWindows = true
    mockSettings.settings = makeSettings({
      assistantMode: 'agent',
      skills: defaultSkillsSettings,
    })

    const names = getExposedToolNames()
    for (const tool of DESKTOP_OS_TOOL_NAMES) {
      expect(names).toContain(tool)
    }
  })

  it('does not expose desktop OS tools in chat mode', () => {
    isWindows = true
    mockSettings.settings = makeSettings({
      assistantMode: 'chat',
      skills: defaultSkillsSettings,
    })

    const names = getExposedToolNames()
    for (const tool of DESKTOP_OS_TOOL_NAMES) {
      expect(names).not.toContain(tool)
    }
  })

  it('exposes the supported desktop OS tools on macOS', () => {
    isWindows = false
    mockSettings.settings = makeSettings({
      assistantMode: 'agent',
      skills: defaultSkillsSettings,
    })

    const names = getExposedToolNames()
    expect(names).toContain('system_active_window')
    expect(names).toContain('system_status')
    expect(names).toContain('system_settings_open')
    expect(names).toContain('system_open_path')
    expect(names).toContain('window_snap')
    expect(names).toContain('app_find')
    expect(names).toContain('app_list')
    expect(names).toContain('app_launch')
    expect(names).not.toContain('window_list')
    expect(names).not.toContain('window_focus')
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

describe('useToolCalling - Code Execution extension exposure gating', () => {
  it('does not expose code_execution when the Code Execution extension is disabled', () => {
    mockSettings.settings = makeSettings({
      assistantMode: 'chat',
      enabledTools: ['web_search', 'code_execution'],
      skills: defaultSkillsSettings,
    })

    expect(getExposedToolNames()).not.toContain('code_execution')
  })

  it('exposes code_execution when the Code Execution extension is enabled', () => {
    mockSettings.settings = makeSettings({
      assistantMode: 'chat',
      enabledTools: ['web_search'],
      skills: withCodeExecutionEnabled(defaultSkillsSettings, true),
    })

    expect(getExposedToolNames()).toContain('code_execution')
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

describe('useToolCalling - Artifacts extension exposure gating', () => {
  it('does not expose artifact tools when the Artifacts extension is disabled', () => {
    mockSettings.settings = makeSettings({
      skills: defaultSkillsSettings,
    })

    const names = getExposedToolNames()
    for (const tool of ARTIFACT_TOOL_NAMES) {
      expect(names).not.toContain(tool)
    }
  })

  it('exposes artifact tools when the Artifacts extension is enabled', () => {
    mockSettings.settings = makeSettings({
      skills: {
        ...defaultSkillsSettings,
        artifacts: { enabled: true },
      },
    })

    const names = getExposedToolNames()
    for (const tool of ARTIFACT_TOOL_NAMES) {
      expect(names).toContain(tool)
    }
  })
})

describe('useToolCalling - Agent Skills activation tool exposure gating', () => {
  it('does not expose activate_skill when Agent Skills are disabled', () => {
    mockSettings.settings = makeSettings({
      agentSkills: {
        enabled: false,
        projectRoot: '',
        disabledSkillNames: [],
        catalog: [
          {
            name: 'design-review',
            description: 'Review UI',
            scope: 'user',
            skillPath: 'C:/Users/Test/.agents/skills/design/SKILL.md',
            skillDir: 'C:/Users/Test/.agents/skills/design',
          },
        ],
      },
    })

    expect(getExposedToolNames()).not.toContain('activate_skill')
  })

  it('exposes activate_skill only when at least one enabled Agent Skill exists', () => {
    mockSettings.settings = makeSettings({
      agentSkills: {
        enabled: true,
        projectRoot: '',
        disabledSkillNames: [],
        catalog: [
          {
            name: 'design-review',
            description: 'Review UI',
            scope: 'user',
            skillPath: 'C:/Users/Test/.agents/skills/design/SKILL.md',
            skillDir: 'C:/Users/Test/.agents/skills/design',
          },
        ],
      },
    })

    expect(getExposedToolNames()).toContain('activate_skill')
  })

  it('hides activate_skill when every discovered Agent Skill is disabled', () => {
    mockSettings.settings = makeSettings({
      agentSkills: {
        enabled: true,
        projectRoot: '',
        disabledSkillNames: ['design-review'],
        catalog: [
          {
            name: 'design-review',
            description: 'Review UI',
            scope: 'user',
            skillPath: 'C:/Users/Test/.agents/skills/design/SKILL.md',
            skillDir: 'C:/Users/Test/.agents/skills/design',
          },
        ],
      },
    })

    expect(getExposedToolNames()).not.toContain('activate_skill')
  })
})

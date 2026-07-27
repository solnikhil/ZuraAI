import { describe, expect, it } from 'vitest'

import {
  BUILTIN_MAIN_TOOL_NAMES,
  BUILTIN_TOOL_SECURITY_PROFILES,
  getBuiltinToolSecurityProfile,
  getToolSecurityProfile,
} from './builtinMainToolContract'
import { builtInMainToolDefinitions } from './builtinTools'

describe('built-in tool security profile', () => {
  it('exhaustively covers the main manifest and agrees with model-facing approval metadata', () => {
    expect(Object.keys(BUILTIN_TOOL_SECURITY_PROFILES).sort()).toEqual(
      [...BUILTIN_MAIN_TOOL_NAMES].sort()
    )

    for (const name of BUILTIN_MAIN_TOOL_NAMES) {
      const descriptor = builtInMainToolDefinitions.find((tool) => tool.name === name)
      expect(BUILTIN_TOOL_SECURITY_PROFILES[name].approval === 'always').toBe(
        descriptor?.requiresApproval === true
      )
    }
  })

  it('resolves declared read-only shell inspection without weakening shell approval or risk', () => {
    expect(getBuiltinToolSecurityProfile('system_shell', { mutatesState: false })).toMatchObject({
      approval: 'always',
      mutation: 'read-only',
      risk: 'high',
      verification: null,
      concurrency: 'parallel',
    })
    expect(getBuiltinToolSecurityProfile('system_shell', {})).toMatchObject({
      mutation: 'mutating',
      verification: 'shell',
      concurrency: 'serial',
    })
  })

  it('keeps every MCP tool approval-gated, mutating, and serial regardless of annotations', () => {
    expect(getToolSecurityProfile('mcp__filesystem__read_file')).toEqual({
      approval: 'always',
      mutation: 'mutating',
      risk: 'elevated',
      verification: 'generic',
      concurrency: 'serial',
    })
  })
})

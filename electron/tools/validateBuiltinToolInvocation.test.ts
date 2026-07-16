import { describe, expect, it } from 'vitest'

import { BUILTIN_MAIN_TOOL_NAMES } from '../../src/tools/builtinMainToolContract'
import { validateBuiltinToolInvocation } from './validateBuiltinToolInvocation'

describe('validateBuiltinToolInvocation', () => {
  it('compiles every built-in main tool schema', () => {
    for (const toolName of BUILTIN_MAIN_TOOL_NAMES) {
      const result = validateBuiltinToolInvocation(toolName, {})
      if (!result.ok) {
        expect(result.error).not.toContain('schema could not be compiled')
      }
    }
  })

  it('rejects undeclared and reserved execution-authority properties', () => {
    expect(
      validateBuiltinToolInvocation('computer_click', { x: 10, y: 20, autoApprove: true })
    ).toEqual({
      ok: false,
      error:
        'Invalid arguments for tool "computer_click": reserved properties are not model arguments: autoApprove.',
    })
    expect(
      validateBuiltinToolInvocation('activate_skill', {
        name: 'demo-skill',
        _agentSkills: { projectRoot: 'C:\\demo' },
      })
    ).toEqual({
      ok: false,
      error:
        'Invalid arguments for tool "activate_skill": reserved properties are not model arguments: _agentSkills.',
    })
    expect(
      validateBuiltinToolInvocation('file_read', { path: 'C:\\demo.txt', surprise: true })
    ).toMatchObject({ ok: false })
  })

  it('rejects arrays, type mismatches, missing fields, and empty required strings', () => {
    expect(validateBuiltinToolInvocation('file_read', [])).toEqual({
      ok: false,
      error: 'Tool "file_read" arguments must be a JSON object.',
    })
    expect(validateBuiltinToolInvocation('file_read', { path: 42 })).toEqual({
      ok: false,
      error: 'Invalid arguments for tool "file_read": /path must be string',
    })
    expect(validateBuiltinToolInvocation('file_read', {})).toEqual({
      ok: false,
      error: 'Invalid arguments for tool "file_read": missing required property "path"',
    })
    expect(validateBuiltinToolInvocation('file_read', { path: '' })).toEqual({
      ok: false,
      error:
        'Invalid arguments for tool "file_read": required string properties must not be empty: path.',
    })
  })
})

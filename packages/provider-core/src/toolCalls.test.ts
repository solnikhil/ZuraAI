import { afterEach, describe, expect, it, vi } from 'vitest'
import { validateToolCall } from './toolCalls'

const tools = [
  {
    name: 'web_search',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', minLength: 1 } },
      required: ['query'],
      additionalProperties: false,
    },
  },
]

describe('validateToolCall', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('accepts schema-valid native arguments', () => {
    expect(
      validateToolCall({
        id: 'call-1',
        name: 'web_search',
        rawArguments: '{"query":"zura"}',
        tools,
      })
    ).toEqual({
      ok: true,
      toolCall: { id: 'call-1', name: 'web_search', arguments: { query: 'zura' } },
    })
  })

  it.each(['{query:"zura"}', '{"query":"zura"', 'zura'])(
    'rejects malformed arguments: %s',
    (rawArguments) => {
      expect(validateToolCall({ id: 'call-1', name: 'web_search', rawArguments, tools }).ok).toBe(
        false
      )
    }
  )

  it('does not invent required arguments', () => {
    const result = validateToolCall({ id: 'call-1', name: 'web_search', rawArguments: '{}', tools })
    expect(result).toMatchObject({ ok: false, error: { code: 'schema_validation_failed' } })
  })

  it('rejects whitespace-only required strings even when the schema omitted minLength', () => {
    const permissiveTools = [
      {
        name: 'web_search',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        },
      },
    ]
    expect(
      validateToolCall({
        id: 'call-1',
        name: 'web_search',
        rawArguments: '{"query":"   "}',
        tools: permissiveTools,
      })
    ).toMatchObject({ ok: false, error: { code: 'schema_validation_failed' } })
  })

  it('validates without dynamic code generation under an Electron-style CSP', () => {
    vi.stubGlobal('Function', function blockedDynamicCodeGeneration(): never {
      throw new EvalError("Refused to evaluate a string because 'unsafe-eval' is not allowed")
    })

    expect(
      validateToolCall({
        id: 'call-csp',
        name: 'web_search',
        rawArguments: '{"query":"background-safe automation"}',
        tools,
      })
    ).toEqual({
      ok: true,
      toolCall: {
        id: 'call-csp',
        name: 'web_search',
        arguments: { query: 'background-safe automation' },
      },
    })
  })

  it('supports local references and draft 2020 composition without coercion', () => {
    const referencedTools = [
      {
        name: 'set_value',
        inputSchema: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          $defs: {
            value: {
              oneOf: [
                { type: 'string', minLength: 1 },
                { type: 'number', minimum: 0 },
              ],
            },
          },
          type: 'object',
          properties: { value: { $ref: '#/$defs/value' } },
          required: ['value'],
          additionalProperties: false,
        },
      },
    ]

    expect(
      validateToolCall({
        id: 'valid',
        name: 'set_value',
        rawArguments: { value: 3 },
        tools: referencedTools,
      })
    ).toMatchObject({ ok: true })
    expect(
      validateToolCall({
        id: 'invalid',
        name: 'set_value',
        rawArguments: { value: -1 },
        tools: referencedTools,
      })
    ).toMatchObject({ ok: false, error: { code: 'schema_validation_failed' } })
    expect(
      validateToolCall({
        id: 'coerce',
        name: 'set_value',
        rawArguments: { value: false },
        tools: referencedTools,
      })
    ).toMatchObject({ ok: false, error: { code: 'schema_validation_failed' } })
  })
})

import { describe, expect, it } from 'vitest'
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
})

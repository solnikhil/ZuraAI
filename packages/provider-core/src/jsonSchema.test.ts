import { afterEach, describe, expect, it, vi } from 'vitest'

import { JsonSchemaDefinitionError, validateJsonSchema } from './jsonSchema'

describe('validateJsonSchema', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('validates nested objects without coercing values or allowing extras', () => {
    const schema = {
      type: 'object',
      properties: {
        count: { type: 'integer', minimum: 1 },
        labels: { type: 'array', items: { type: 'string' }, uniqueItems: true },
      },
      required: ['count'],
      additionalProperties: false,
    }

    expect(validateJsonSchema(schema, { count: 2, labels: ['a', 'b'] }).valid).toBe(true)
    expect(validateJsonSchema(schema, { count: '2' }).valid).toBe(false)
    expect(validateJsonSchema(schema, { count: 2, extra: true }).valid).toBe(false)
    expect(validateJsonSchema(schema, { count: 2, labels: ['a', 'a'] }).valid).toBe(false)
  })

  it('supports draft-7 tuple extras and property dependencies', () => {
    const schema = {
      type: 'object',
      properties: {
        tuple: {
          type: 'array',
          items: [{ type: 'string' }],
          additionalItems: false,
        },
        card: { type: 'string' },
        billingAddress: { type: 'string' },
      },
      dependencies: { card: ['billingAddress'] },
    }

    expect(
      validateJsonSchema(schema, {
        tuple: ['one'],
        card: '1234',
        billingAddress: 'home',
      }).valid
    ).toBe(true)
    expect(validateJsonSchema(schema, { tuple: ['one', 'two'] }).valid).toBe(false)
    expect(validateJsonSchema(schema, { card: '1234' }).valid).toBe(false)
  })

  it('supports dependent schemas and local references', () => {
    const schema = {
      $defs: { positive: { type: 'number', exclusiveMinimum: 0 } },
      type: 'object',
      properties: { enabled: { type: 'boolean' }, amount: { $ref: '#/$defs/positive' } },
      dependentSchemas: {
        enabled: { required: ['amount'] },
      },
    }

    expect(validateJsonSchema(schema, { enabled: true, amount: 1 }).valid).toBe(true)
    expect(validateJsonSchema(schema, { enabled: true }).valid).toBe(false)
    expect(validateJsonSchema(schema, { amount: -1 }).valid).toBe(false)
  })

  it('does not require dynamic code generation', () => {
    vi.stubGlobal('Function', function blockedDynamicCodeGeneration(): never {
      throw new EvalError("'unsafe-eval' is not allowed")
    })
    expect(validateJsonSchema({ type: 'string', minLength: 1 }, 'safe').valid).toBe(true)
  })

  it('fails closed for unsupported standard validation keywords', () => {
    expect(() =>
      validateJsonSchema({ type: 'object', unevaluatedProperties: false }, { unexpected: true })
    ).toThrow(JsonSchemaDefinitionError)
  })
})

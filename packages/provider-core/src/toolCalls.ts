import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv'
import Ajv2020 from 'ajv/dist/2020.js'
import type { ProviderToolCall, ProviderToolDefinition } from './types'

export type ToolCallValidationErrorCode =
  | 'unknown_tool'
  | 'empty_arguments'
  | 'invalid_json'
  | 'invalid_argument_shape'
  | 'schema_compilation_failed'
  | 'schema_validation_failed'

export interface ToolCallValidationError {
  code: ToolCallValidationErrorCode
  message: string
  details?: ErrorObject[]
}

export type ToolCallValidationResult =
  | { ok: true; toolCall: ProviderToolCall }
  | { ok: false; error: ToolCallValidationError }

const draft7 = new Ajv({
  allErrors: true,
  coerceTypes: false,
  removeAdditional: false,
  strict: false,
})
const draft2020 = new Ajv2020({
  allErrors: true,
  coerceTypes: false,
  removeAdditional: false,
  strict: false,
})
const validatorCache = new WeakMap<object, ValidateFunction>()

function compileSchema(schema: Record<string, unknown>): ValidateFunction {
  const cached = validatorCache.get(schema)
  if (cached) return cached

  const schemaVersion = typeof schema.$schema === 'string' ? schema.$schema : ''
  const validator = schemaVersion.includes('2020-12')
    ? draft2020.compile(schema)
    : draft7.compile(schema)
  validatorCache.set(schema, validator)
  return validator
}

export function validateToolCall(input: {
  id: string
  name: string
  rawArguments: string | Record<string, unknown>
  tools: readonly ProviderToolDefinition[]
}): ToolCallValidationResult {
  const tool = input.tools.find((candidate) => candidate.name === input.name)
  if (!tool) {
    return {
      ok: false,
      error: { code: 'unknown_tool', message: `Unknown tool: ${input.name}` },
    }
  }

  let parsed: unknown = input.rawArguments
  if (typeof input.rawArguments === 'string') {
    if (!input.rawArguments.trim()) {
      return {
        ok: false,
        error: { code: 'empty_arguments', message: `Tool ${input.name} returned empty arguments.` },
      }
    }
    try {
      parsed = JSON.parse(input.rawArguments)
    } catch {
      return {
        ok: false,
        error: { code: 'invalid_json', message: `Tool ${input.name} returned invalid JSON.` },
      }
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      error: {
        code: 'invalid_argument_shape',
        message: `Tool ${input.name} arguments must be a JSON object.`,
      },
    }
  }

  let validator: ValidateFunction
  try {
    validator = compileSchema(tool.inputSchema)
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'schema_compilation_failed',
        message: error instanceof Error ? error.message : String(error),
      },
    }
  }

  if (!validator(parsed)) {
    return {
      ok: false,
      error: {
        code: 'schema_validation_failed',
        message: `Tool ${input.name} arguments do not match its schema.`,
        details: validator.errors ? [...validator.errors] : undefined,
      },
    }
  }

  const required = Array.isArray(tool.inputSchema.required)
    ? tool.inputSchema.required.filter((key): key is string => typeof key === 'string')
    : []
  const emptyRequiredStrings = required.filter(
    (key) =>
      typeof (parsed as Record<string, unknown>)[key] === 'string' &&
      ((parsed as Record<string, unknown>)[key] as string).trim().length === 0
  )
  if (emptyRequiredStrings.length > 0) {
    return {
      ok: false,
      error: {
        code: 'schema_validation_failed',
        message: `Tool ${input.name} required string arguments must not be empty: ${emptyRequiredStrings.join(', ')}.`,
      },
    }
  }

  return {
    ok: true,
    toolCall: { id: input.id, name: input.name, arguments: parsed as Record<string, unknown> },
  }
}

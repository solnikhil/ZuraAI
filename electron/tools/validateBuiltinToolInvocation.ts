import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv'

import { builtInMainToolManifest } from '../../src/tools/builtinTools'
import type { BuiltinMainToolName } from '../../src/tools/builtinMainToolContract'

const ajv = new Ajv({
  allErrors: true,
  coerceTypes: false,
  removeAdditional: false,
  strict: false,
})

const validators = new Map<BuiltinMainToolName, ValidateFunction>()
const RESERVED_MODEL_ARGUMENTS = new Set(['autoApprove', '_agentSkills', 'approvalToken'])

function getValidator(toolName: BuiltinMainToolName): ValidateFunction {
  const cached = validators.get(toolName)
  if (cached) return cached

  const validator = ajv.compile({
    ...builtInMainToolManifest[toolName].parameters,
    additionalProperties: false,
  })
  validators.set(toolName, validator)
  return validator
}

function describeError(error: ErrorObject): string {
  if (error.keyword === 'required') {
    const missingProperty = (error.params as { missingProperty?: unknown }).missingProperty
    if (typeof missingProperty === 'string') return `missing required property "${missingProperty}"`
  }

  const location = error.instancePath || 'arguments'
  return `${location} ${error.message ?? 'is invalid'}`
}

export type BuiltinToolInvocationValidation =
  | { ok: true; args: Record<string, unknown> }
  | { ok: false; error: string }

export function validateBuiltinToolInvocation(
  toolName: BuiltinMainToolName,
  args: unknown
): BuiltinToolInvocationValidation {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return { ok: false, error: `Tool "${toolName}" arguments must be a JSON object.` }
  }

  const reservedArguments = Object.keys(args).filter((key) => RESERVED_MODEL_ARGUMENTS.has(key))
  if (reservedArguments.length > 0) {
    return {
      ok: false,
      error: `Invalid arguments for tool "${toolName}": reserved properties are not model arguments: ${reservedArguments.join(', ')}.`,
    }
  }

  let validator: ValidateFunction
  try {
    validator = getValidator(toolName)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: `Tool "${toolName}" schema could not be compiled: ${message}` }
  }

  if (!validator(args)) {
    const details = (validator.errors ?? []).slice(0, 3).map(describeError).join('; ')
    return {
      ok: false,
      error: `Invalid arguments for tool "${toolName}"${details ? `: ${details}` : '.'}`,
    }
  }

  const schema = builtInMainToolManifest[toolName].parameters
  const required = Array.isArray(schema.required) ? schema.required : []
  const emptyRequiredStrings = required.filter(
    (key) =>
      typeof (args as Record<string, unknown>)[key] === 'string' &&
      ((args as Record<string, unknown>)[key] as string).trim().length === 0
  )
  if (emptyRequiredStrings.length > 0) {
    return {
      ok: false,
      error: `Invalid arguments for tool "${toolName}": required string properties must not be empty: ${emptyRequiredStrings.join(', ')}.`,
    }
  }

  return { ok: true, args: args as Record<string, unknown> }
}

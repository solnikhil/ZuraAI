import { validateJsonSchema, type JsonSchemaValidationError } from '@zura/provider-core'

import { builtInMainToolManifest } from '../../src/tools/builtinTools'
import type { BuiltinMainToolName } from '../../src/tools/builtinMainToolContract'

const RESERVED_MODEL_ARGUMENTS = new Set(['autoApprove', '_agentSkills', 'approvalToken'])

function describeError(error: JsonSchemaValidationError): string {
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

  let validation: ReturnType<typeof validateJsonSchema>
  try {
    validation = validateJsonSchema(
      { ...builtInMainToolManifest[toolName].parameters, additionalProperties: false },
      args
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: `Tool "${toolName}" schema could not be compiled: ${message}` }
  }

  if (!validation.valid) {
    const details = validation.errors.slice(0, 3).map(describeError).join('; ')
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

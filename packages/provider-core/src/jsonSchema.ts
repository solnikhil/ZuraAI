export interface JsonSchemaValidationError {
  instancePath: string
  schemaPath: string
  keyword: string
  params: Record<string, unknown>
  message?: string
}

export class JsonSchemaDefinitionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JsonSchemaDefinitionError'
  }
}

type JsonSchema = boolean | Record<string, unknown>

const ANNOTATION_KEYWORDS = new Set([
  '$comment',
  '$id',
  '$schema',
  'default',
  'deprecated',
  'description',
  'examples',
  'readOnly',
  'title',
  'writeOnly',
])

const VALIDATION_KEYWORDS = new Set([
  '$defs',
  '$ref',
  'additionalItems',
  'additionalProperties',
  'allOf',
  'anyOf',
  'const',
  'contains',
  'dependentRequired',
  'dependentSchemas',
  'dependencies',
  'else',
  'enum',
  'exclusiveMaximum',
  'exclusiveMinimum',
  'if',
  'items',
  'maxContains',
  'maximum',
  'maxItems',
  'maxLength',
  'maxProperties',
  'minContains',
  'minimum',
  'minItems',
  'minLength',
  'minProperties',
  'multipleOf',
  'not',
  'nullable',
  'oneOf',
  'pattern',
  'patternProperties',
  'prefixItems',
  'properties',
  'propertyNames',
  'required',
  'then',
  'type',
  'uniqueItems',
])

const UNSUPPORTED_VALIDATION_KEYWORDS = new Set(['unevaluatedItems', 'unevaluatedProperties'])

function escapePointer(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length && left.every((value, index) => deepEqual(value, right[index]))
    )
  }
  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left)
    const rightKeys = Object.keys(right)
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key) =>
          Object.prototype.hasOwnProperty.call(right, key) && deepEqual(left[key], right[key])
      )
    )
  }
  return false
}

function schemaAt(root: JsonSchema, reference: string): JsonSchema {
  if (!reference.startsWith('#/')) {
    throw new JsonSchemaDefinitionError(
      `Only local JSON Schema references are supported: ${reference}`
    )
  }
  let current: unknown = root
  for (const encodedPart of reference.slice(2).split('/')) {
    const part = encodedPart.replace(/~1/g, '/').replace(/~0/g, '~')
    if (!isRecord(current) || !Object.prototype.hasOwnProperty.call(current, part)) {
      throw new JsonSchemaDefinitionError(`JSON Schema reference does not exist: ${reference}`)
    }
    current = current[part]
  }
  if (typeof current !== 'boolean' && !isRecord(current)) {
    throw new JsonSchemaDefinitionError(`JSON Schema reference is not a schema: ${reference}`)
  }
  return current
}

function schemaArray(value: unknown, keyword: string): JsonSchema[] {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== 'boolean' && !isRecord(entry))
  ) {
    throw new JsonSchemaDefinitionError(`JSON Schema "${keyword}" must be an array of schemas.`)
  }
  return value as JsonSchema[]
}

function assertKnownKeywords(schema: Record<string, unknown>): void {
  for (const keyword of Object.keys(schema)) {
    if (UNSUPPORTED_VALIDATION_KEYWORDS.has(keyword)) {
      throw new JsonSchemaDefinitionError(`Unsupported JSON Schema validation keyword: ${keyword}`)
    }
    if (!ANNOTATION_KEYWORDS.has(keyword) && !VALIDATION_KEYWORDS.has(keyword)) {
      // Unknown extension keywords are annotations under JSON Schema and do not affect validation.
      // Reject only vocabularies that claim to be validation keywords via the standard namespace.
      if (!keyword.startsWith('x-')) continue
    }
  }
}

function valueMatchesType(value: unknown, type: string): boolean {
  switch (type) {
    case 'null':
      return value === null
    case 'boolean':
      return typeof value === 'boolean'
    case 'object':
      return isRecord(value)
    case 'array':
      return Array.isArray(value)
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value)
    case 'string':
      return typeof value === 'string'
    default:
      throw new JsonSchemaDefinitionError(`Unsupported JSON Schema type: ${type}`)
  }
}

function validateNode(
  schema: JsonSchema,
  value: unknown,
  root: JsonSchema,
  instancePath: string,
  schemaPath: string,
  referenceStack: Set<string>
): JsonSchemaValidationError[] {
  if (schema === true) return []
  if (schema === false) {
    return [
      {
        instancePath,
        schemaPath,
        keyword: 'false schema',
        params: {},
        message: 'must NOT be valid',
      },
    ]
  }
  assertKnownKeywords(schema)

  if (typeof schema.$ref === 'string') {
    if (referenceStack.has(schema.$ref)) {
      throw new JsonSchemaDefinitionError(`Circular JSON Schema reference: ${schema.$ref}`)
    }
    const nextStack = new Set(referenceStack).add(schema.$ref)
    return validateNode(
      schemaAt(root, schema.$ref),
      value,
      root,
      instancePath,
      schema.$ref,
      nextStack
    )
  }

  const errors: JsonSchemaValidationError[] = []
  const add = (keyword: string, message: string, params: Record<string, unknown> = {}) => {
    errors.push({ instancePath, schemaPath: `${schemaPath}/${keyword}`, keyword, params, message })
  }

  if (schema.nullable === true && value === null) return errors

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type]
    if (types.some((type) => typeof type !== 'string')) {
      throw new JsonSchemaDefinitionError(
        'JSON Schema "type" must be a string or array of strings.'
      )
    }
    if (!(types as string[]).some((type) => valueMatchesType(value, type))) {
      add('type', `must be ${types.join(',')}`, { type: schema.type })
      return errors
    }
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => deepEqual(candidate, value))) {
    add('enum', 'must be equal to one of the allowed values', { allowedValues: schema.enum })
  }
  if (Object.prototype.hasOwnProperty.call(schema, 'const') && !deepEqual(schema.const, value)) {
    add('const', 'must be equal to constant', { allowedValue: schema.const })
  }

  if (schema.allOf !== undefined) {
    for (const [index, child] of schemaArray(schema.allOf, 'allOf').entries()) {
      errors.push(
        ...validateNode(
          child,
          value,
          root,
          instancePath,
          `${schemaPath}/allOf/${index}`,
          referenceStack
        )
      )
    }
  }
  if (schema.anyOf !== undefined) {
    // Evaluate every branch so a malformed later branch cannot be hidden by an
    // earlier match. Ajv's former compile step rejected the whole schema first.
    const matches = schemaArray(schema.anyOf, 'anyOf')
      .map(
        (child, index) =>
          validateNode(
            child,
            value,
            root,
            instancePath,
            `${schemaPath}/anyOf/${index}`,
            referenceStack
          ).length === 0
      )
      .some(Boolean)
    if (!matches) add('anyOf', 'must match a schema in anyOf')
  }
  if (schema.oneOf !== undefined) {
    const matchCount = schemaArray(schema.oneOf, 'oneOf').filter(
      (child, index) =>
        validateNode(
          child,
          value,
          root,
          instancePath,
          `${schemaPath}/oneOf/${index}`,
          referenceStack
        ).length === 0
    ).length
    if (matchCount !== 1)
      add('oneOf', 'must match exactly one schema in oneOf', { passingSchemas: matchCount })
  }
  if (schema.not !== undefined) {
    const notSchema = schema.not
    if (typeof notSchema !== 'boolean' && !isRecord(notSchema)) {
      throw new JsonSchemaDefinitionError('JSON Schema "not" must be a schema.')
    }
    if (
      validateNode(notSchema, value, root, instancePath, `${schemaPath}/not`, referenceStack)
        .length === 0
    ) {
      add('not', 'must NOT be valid')
    }
  }

  if (schema.if !== undefined) {
    const condition = schema.if
    if (typeof condition !== 'boolean' && !isRecord(condition)) {
      throw new JsonSchemaDefinitionError('JSON Schema "if" must be a schema.')
    }
    const conditionMatches =
      validateNode(condition, value, root, instancePath, `${schemaPath}/if`, referenceStack)
        .length === 0
    const branch = conditionMatches ? schema.then : schema.else
    if (branch !== undefined) {
      if (typeof branch !== 'boolean' && !isRecord(branch)) {
        throw new JsonSchemaDefinitionError('JSON Schema conditional branches must be schemas.')
      }
      errors.push(
        ...validateNode(
          branch,
          value,
          root,
          instancePath,
          `${schemaPath}/${conditionMatches ? 'then' : 'else'}`,
          referenceStack
        )
      )
    }
  }

  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && [...value].length < schema.minLength) {
      add('minLength', `must NOT have fewer than ${schema.minLength} characters`, {
        limit: schema.minLength,
      })
    }
    if (typeof schema.maxLength === 'number' && [...value].length > schema.maxLength) {
      add('maxLength', `must NOT have more than ${schema.maxLength} characters`, {
        limit: schema.maxLength,
      })
    }
    if (typeof schema.pattern === 'string') {
      let expression: RegExp
      try {
        expression = new RegExp(schema.pattern, 'u')
      } catch {
        throw new JsonSchemaDefinitionError(
          `Invalid JSON Schema regular expression: ${schema.pattern}`
        )
      }
      if (!expression.test(value))
        add('pattern', `must match pattern "${schema.pattern}"`, { pattern: schema.pattern })
    }
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (typeof schema.minimum === 'number' && value < schema.minimum)
      add('minimum', `must be >= ${schema.minimum}`, { limit: schema.minimum })
    if (typeof schema.maximum === 'number' && value > schema.maximum)
      add('maximum', `must be <= ${schema.maximum}`, { limit: schema.maximum })
    if (typeof schema.exclusiveMinimum === 'number' && value <= schema.exclusiveMinimum)
      add('exclusiveMinimum', `must be > ${schema.exclusiveMinimum}`, {
        limit: schema.exclusiveMinimum,
      })
    if (typeof schema.exclusiveMaximum === 'number' && value >= schema.exclusiveMaximum)
      add('exclusiveMaximum', `must be < ${schema.exclusiveMaximum}`, {
        limit: schema.exclusiveMaximum,
      })
    if (typeof schema.multipleOf === 'number') {
      if (!(schema.multipleOf > 0))
        throw new JsonSchemaDefinitionError('JSON Schema "multipleOf" must be greater than zero.')
      const quotient = value / schema.multipleOf
      if (
        Math.abs(quotient - Math.round(quotient)) >
        Number.EPSILON * Math.max(1, Math.abs(quotient))
      ) {
        add('multipleOf', `must be multiple of ${schema.multipleOf}`, {
          multipleOf: schema.multipleOf,
        })
      }
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems)
      add('minItems', `must NOT have fewer than ${schema.minItems} items`, {
        limit: schema.minItems,
      })
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems)
      add('maxItems', `must NOT have more than ${schema.maxItems} items`, {
        limit: schema.maxItems,
      })
    if (schema.uniqueItems === true) {
      const duplicate = value.some((entry, index) =>
        value.slice(0, index).some((seen) => deepEqual(seen, entry))
      )
      if (duplicate) add('uniqueItems', 'must NOT have duplicate items')
    }
    const prefixItems =
      schema.prefixItems === undefined ? [] : schemaArray(schema.prefixItems, 'prefixItems')
    prefixItems.forEach((child, index) => {
      if (index < value.length)
        errors.push(
          ...validateNode(
            child,
            value[index],
            root,
            `${instancePath}/${index}`,
            `${schemaPath}/prefixItems/${index}`,
            referenceStack
          )
        )
    })
    if (schema.items !== undefined) {
      if (Array.isArray(schema.items)) {
        const tupleItems = schemaArray(schema.items, 'items')
        tupleItems.forEach((child, index) => {
          if (index < value.length)
            errors.push(
              ...validateNode(
                child,
                value[index],
                root,
                `${instancePath}/${index}`,
                `${schemaPath}/items/${index}`,
                referenceStack
              )
            )
        })
        if (value.length > tupleItems.length && schema.additionalItems !== undefined) {
          if (schema.additionalItems === false) {
            add('additionalItems', 'must NOT have additional items', {
              limit: tupleItems.length,
            })
          } else if (schema.additionalItems !== true) {
            if (!isRecord(schema.additionalItems)) {
              throw new JsonSchemaDefinitionError(
                'JSON Schema "additionalItems" must be a schema or boolean.'
              )
            }
            for (let index = tupleItems.length; index < value.length; index += 1) {
              errors.push(
                ...validateNode(
                  schema.additionalItems,
                  value[index],
                  root,
                  `${instancePath}/${index}`,
                  `${schemaPath}/additionalItems`,
                  referenceStack
                )
              )
            }
          }
        }
      } else if (typeof schema.items === 'boolean' || isRecord(schema.items)) {
        const start = prefixItems.length
        for (let index = start; index < value.length; index += 1) {
          errors.push(
            ...validateNode(
              schema.items,
              value[index],
              root,
              `${instancePath}/${index}`,
              `${schemaPath}/items`,
              referenceStack
            )
          )
        }
      } else {
        throw new JsonSchemaDefinitionError(
          'JSON Schema "items" must be a schema or array of schemas.'
        )
      }
    }
    if (schema.contains !== undefined) {
      if (typeof schema.contains !== 'boolean' && !isRecord(schema.contains))
        throw new JsonSchemaDefinitionError('JSON Schema "contains" must be a schema.')
      const count = value.filter(
        (entry, index) =>
          validateNode(
            schema.contains as JsonSchema,
            entry,
            root,
            `${instancePath}/${index}`,
            `${schemaPath}/contains`,
            referenceStack
          ).length === 0
      ).length
      const minimum = typeof schema.minContains === 'number' ? schema.minContains : 1
      const maximum =
        typeof schema.maxContains === 'number' ? schema.maxContains : Number.POSITIVE_INFINITY
      if (count < minimum || count > maximum)
        add('contains', 'must contain the required number of matching items', {
          minContains: minimum,
          maxContains: maximum,
          contains: count,
        })
    }
  }

  if (isRecord(value)) {
    const keys = Object.keys(value)
    if (typeof schema.minProperties === 'number' && keys.length < schema.minProperties)
      add('minProperties', `must NOT have fewer than ${schema.minProperties} properties`, {
        limit: schema.minProperties,
      })
    if (typeof schema.maxProperties === 'number' && keys.length > schema.maxProperties)
      add('maxProperties', `must NOT have more than ${schema.maxProperties} properties`, {
        limit: schema.maxProperties,
      })
    if (schema.required !== undefined) {
      if (
        !Array.isArray(schema.required) ||
        schema.required.some((entry) => typeof entry !== 'string')
      )
        throw new JsonSchemaDefinitionError('JSON Schema "required" must be an array of strings.')
      for (const required of schema.required as string[]) {
        if (!Object.prototype.hasOwnProperty.call(value, required))
          add('required', `must have required property '${required}'`, {
            missingProperty: required,
          })
      }
    }
    const validateDependentRequired = (keyword: 'dependentRequired' | 'dependencies'): void => {
      const definitions = schema[keyword]
      if (definitions === undefined) return
      if (!isRecord(definitions)) {
        throw new JsonSchemaDefinitionError(`JSON Schema "${keyword}" must be an object.`)
      }
      for (const [property, dependency] of Object.entries(definitions)) {
        if (!Object.prototype.hasOwnProperty.call(value, property)) continue
        if (!Array.isArray(dependency)) {
          if (keyword === 'dependentRequired') {
            throw new JsonSchemaDefinitionError(
              'JSON Schema "dependentRequired" dependencies must be arrays of strings.'
            )
          }
          continue
        }
        if (dependency.some((entry) => typeof entry !== 'string')) {
          throw new JsonSchemaDefinitionError(
            `JSON Schema "${keyword}" property dependencies must be arrays of strings.`
          )
        }
        for (const required of dependency as string[]) {
          if (!Object.prototype.hasOwnProperty.call(value, required)) {
            add(
              keyword,
              `must have property '${required}' when property '${property}' is present`,
              {
                property,
                missingProperty: required,
              }
            )
          }
        }
      }
    }
    validateDependentRequired('dependentRequired')
    validateDependentRequired('dependencies')

    const validateDependentSchemas = (keyword: 'dependentSchemas' | 'dependencies'): void => {
      const definitions = schema[keyword]
      if (definitions === undefined) return
      if (!isRecord(definitions)) {
        throw new JsonSchemaDefinitionError(`JSON Schema "${keyword}" must be an object.`)
      }
      for (const [property, dependency] of Object.entries(definitions)) {
        if (!Object.prototype.hasOwnProperty.call(value, property)) continue
        if (Array.isArray(dependency)) {
          if (keyword === 'dependentSchemas') {
            throw new JsonSchemaDefinitionError(
              'JSON Schema "dependentSchemas" dependencies must be schemas.'
            )
          }
          continue
        }
        if (typeof dependency !== 'boolean' && !isRecord(dependency)) {
          throw new JsonSchemaDefinitionError(
            `JSON Schema "${keyword}" dependencies must be schemas or arrays of strings.`
          )
        }
        errors.push(
          ...validateNode(
            dependency,
            value,
            root,
            instancePath,
            `${schemaPath}/${keyword}/${escapePointer(property)}`,
            referenceStack
          )
        )
      }
    }
    validateDependentSchemas('dependentSchemas')
    validateDependentSchemas('dependencies')
    const properties = schema.properties === undefined ? {} : schema.properties
    if (!isRecord(properties))
      throw new JsonSchemaDefinitionError('JSON Schema "properties" must be an object.')
    for (const [key, child] of Object.entries(properties)) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        if (typeof child !== 'boolean' && !isRecord(child))
          throw new JsonSchemaDefinitionError(`JSON Schema property "${key}" must be a schema.`)
        errors.push(
          ...validateNode(
            child,
            value[key],
            root,
            `${instancePath}/${escapePointer(key)}`,
            `${schemaPath}/properties/${escapePointer(key)}`,
            referenceStack
          )
        )
      }
    }
    const patternProperties = schema.patternProperties === undefined ? {} : schema.patternProperties
    if (!isRecord(patternProperties))
      throw new JsonSchemaDefinitionError('JSON Schema "patternProperties" must be an object.')
    const patterns = Object.entries(patternProperties).map(([pattern, child]) => {
      if (typeof child !== 'boolean' && !isRecord(child))
        throw new JsonSchemaDefinitionError(
          `JSON Schema pattern property "${pattern}" must be a schema.`
        )
      try {
        return { expression: new RegExp(pattern, 'u'), child: child as JsonSchema, pattern }
      } catch {
        throw new JsonSchemaDefinitionError(`Invalid JSON Schema regular expression: ${pattern}`)
      }
    })
    for (const key of keys) {
      const matchingPatterns = patterns.filter(({ expression }) => expression.test(key))
      for (const { child, pattern } of matchingPatterns)
        errors.push(
          ...validateNode(
            child,
            value[key],
            root,
            `${instancePath}/${escapePointer(key)}`,
            `${schemaPath}/patternProperties/${escapePointer(pattern)}`,
            referenceStack
          )
        )
      const declared =
        Object.prototype.hasOwnProperty.call(properties, key) || matchingPatterns.length > 0
      if (!declared && schema.additionalProperties !== undefined) {
        if (schema.additionalProperties === false)
          add('additionalProperties', 'must NOT have additional properties', {
            additionalProperty: key,
          })
        else if (schema.additionalProperties !== true) {
          if (!isRecord(schema.additionalProperties))
            throw new JsonSchemaDefinitionError(
              'JSON Schema "additionalProperties" must be a schema or boolean.'
            )
          errors.push(
            ...validateNode(
              schema.additionalProperties,
              value[key],
              root,
              `${instancePath}/${escapePointer(key)}`,
              `${schemaPath}/additionalProperties`,
              referenceStack
            )
          )
        }
      }
    }
    if (schema.propertyNames !== undefined) {
      if (typeof schema.propertyNames !== 'boolean' && !isRecord(schema.propertyNames))
        throw new JsonSchemaDefinitionError('JSON Schema "propertyNames" must be a schema.')
      for (const key of keys)
        errors.push(
          ...validateNode(
            schema.propertyNames,
            key,
            root,
            instancePath,
            `${schemaPath}/propertyNames`,
            referenceStack
          )
        )
    }
  }

  return errors
}

export function validateJsonSchema(
  schema: unknown,
  value: unknown
): { valid: boolean; errors: JsonSchemaValidationError[] } {
  if (typeof schema !== 'boolean' && !isRecord(schema)) {
    throw new JsonSchemaDefinitionError('JSON Schema must be an object or boolean.')
  }
  const errors = validateNode(schema, value, schema, '', '#', new Set())
  return { valid: errors.length === 0, errors }
}

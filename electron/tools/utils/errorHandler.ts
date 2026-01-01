// Error Handler Utility - Shared error handling for tools
// Consolidates duplicated error handling patterns across tools

import type { ToolResult, ToolHandler } from '../types'

/**
 * Create a standardized error result
 * @param message - Error message to include in the result
 * @returns ToolResult with success: false and the error message
 */
export function createErrorResult(message: string): ToolResult {
    return {
        success: false,
        error: message
    }
}

/**
 * Create a standardized success result
 * @param data - Data to include in the result
 * @returns ToolResult with success: true and the data
 */
export function createSuccessResult(data: any): ToolResult {
    return {
        success: true,
        data
    }
}

/**
 * Wrap a tool handler with consistent error handling
 * Catches any errors thrown by the handler and returns a standardized error result
 * 
 * @param handler - The tool handler function to wrap
 * @param toolName - Name of the tool for logging purposes
 * @returns Wrapped handler with error handling
 * 
 * @example
 * const safeHandler = withErrorHandling(
 *     async (args: MyArgs) => {
 *         // Tool logic here
 *         return createSuccessResult({ result: 'done' })
 *     },
 *     'my_tool'
 * )
 */
export function withErrorHandling<T extends Record<string, any>>(
    handler: (args: T) => Promise<ToolResult>,
    toolName: string
): (args: T) => Promise<ToolResult> {
    return async (args: T): Promise<ToolResult> => {
        try {
            return await handler(args)
        } catch (error: any) {
            console.error(`[TOOL] ${toolName} failed:`, error)
            return createErrorResult(error.message || `Failed to execute ${toolName}`)
        }
    }
}

// ============================================================================
// Input Validation Helpers
// ============================================================================

/**
 * Result type for validation functions
 * Returns the validated value on success, or a ToolResult error on failure
 */
export type ValidationResult<T> = T | ToolResult

/**
 * Type guard to check if a validation result is an error
 * @param result - The validation result to check
 * @returns true if the result is a ToolResult error
 */
export function isValidationError(result: ValidationResult<any>): result is ToolResult {
    return result !== null && 
           typeof result === 'object' && 
           'success' in result && 
           result.success === false
}

/**
 * Validate that a parameter is a string
 * @param value - Value to validate
 * @param paramName - Name of the parameter for error messages
 * @returns The string value or a ToolResult error
 * 
 * @example
 * const result = validateString(args.name, 'name')
 * if (isValidationError(result)) return result
 * // result is now typed as string
 */
export function validateString(value: any, paramName: string): ValidationResult<string> {
    if (typeof value !== 'string') {
        return createErrorResult(`${paramName} must be a string`)
    }
    return value
}

/**
 * Validate that a parameter is a non-empty string
 * @param value - Value to validate
 * @param paramName - Name of the parameter for error messages
 * @returns The string value or a ToolResult error
 */
export function validateNonEmptyString(value: any, paramName: string): ValidationResult<string> {
    if (typeof value !== 'string') {
        return createErrorResult(`${paramName} must be a string`)
    }
    if (value.trim().length === 0) {
        return createErrorResult(`${paramName} cannot be empty`)
    }
    return value
}

/**
 * Validate that a parameter is a number
 * @param value - Value to validate
 * @param paramName - Name of the parameter for error messages
 * @param defaultValue - Optional default value if value is undefined
 * @returns The number value or a ToolResult error
 * 
 * @example
 * const result = validateNumber(args.count, 'count', 10)
 * if (isValidationError(result)) return result
 * // result is now typed as number
 */
export function validateNumber(
    value: any, 
    paramName: string, 
    defaultValue?: number
): ValidationResult<number> {
    if (value === undefined && defaultValue !== undefined) {
        return defaultValue
    }
    if (typeof value !== 'number' || isNaN(value)) {
        return createErrorResult(`${paramName} must be a number`)
    }
    return value
}

/**
 * Validate that a parameter is a number within a range
 * @param value - Value to validate
 * @param paramName - Name of the parameter for error messages
 * @param min - Minimum allowed value (inclusive)
 * @param max - Maximum allowed value (inclusive)
 * @param defaultValue - Optional default value if value is undefined
 * @returns The number value or a ToolResult error
 */
export function validateNumberInRange(
    value: any,
    paramName: string,
    min: number,
    max: number,
    defaultValue?: number
): ValidationResult<number> {
    if (value === undefined && defaultValue !== undefined) {
        return defaultValue
    }
    if (typeof value !== 'number' || isNaN(value)) {
        return createErrorResult(`${paramName} must be a number`)
    }
    if (value < min || value > max) {
        return createErrorResult(`${paramName} must be between ${min} and ${max}`)
    }
    return value
}

/**
 * Validate that a parameter is a boolean
 * @param value - Value to validate
 * @param paramName - Name of the parameter for error messages
 * @param defaultValue - Optional default value if value is undefined
 * @returns The boolean value or a ToolResult error
 */
export function validateBoolean(
    value: any, 
    paramName: string, 
    defaultValue?: boolean
): ValidationResult<boolean> {
    if (value === undefined && defaultValue !== undefined) {
        return defaultValue
    }
    if (typeof value !== 'boolean') {
        return createErrorResult(`${paramName} must be a boolean`)
    }
    return value
}

/**
 * Validate that a parameter is an array
 * @param value - Value to validate
 * @param paramName - Name of the parameter for error messages
 * @returns The array value or a ToolResult error
 */
export function validateArray<T = any>(value: any, paramName: string): ValidationResult<T[]> {
    if (!Array.isArray(value)) {
        return createErrorResult(`${paramName} must be an array`)
    }
    return value
}

/**
 * Validate that a parameter is a non-empty array
 * @param value - Value to validate
 * @param paramName - Name of the parameter for error messages
 * @returns The array value or a ToolResult error
 */
export function validateNonEmptyArray<T = any>(value: any, paramName: string): ValidationResult<T[]> {
    if (!Array.isArray(value)) {
        return createErrorResult(`${paramName} must be an array`)
    }
    if (value.length === 0) {
        return createErrorResult(`${paramName} cannot be empty`)
    }
    return value
}

/**
 * Validate that a parameter is an object
 * @param value - Value to validate
 * @param paramName - Name of the parameter for error messages
 * @returns The object value or a ToolResult error
 */
export function validateObject<T extends Record<string, any> = Record<string, any>>(
    value: any, 
    paramName: string
): ValidationResult<T> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return createErrorResult(`${paramName} must be an object`)
    }
    return value as T
}

/**
 * Validate that a parameter is one of the allowed values
 * @param value - Value to validate
 * @param paramName - Name of the parameter for error messages
 * @param allowedValues - Array of allowed values
 * @param defaultValue - Optional default value if value is undefined
 * @returns The value or a ToolResult error
 */
export function validateEnum<T>(
    value: any,
    paramName: string,
    allowedValues: readonly T[],
    defaultValue?: T
): ValidationResult<T> {
    if (value === undefined && defaultValue !== undefined) {
        return defaultValue
    }
    if (!allowedValues.includes(value)) {
        return createErrorResult(
            `${paramName} must be one of: ${allowedValues.join(', ')}`
        )
    }
    return value
}

/**
 * Validate an optional parameter - returns undefined if not provided
 * @param value - Value to validate
 * @param validator - Validation function to apply if value is provided
 * @returns The validated value, undefined, or a ToolResult error
 */
export function validateOptional<T>(
    value: any,
    validator: (val: any) => ValidationResult<T>
): ValidationResult<T | undefined> {
    if (value === undefined || value === null) {
        return undefined
    }
    return validator(value)
}

// ============================================================================
// Error Formatting Helpers
// ============================================================================

/**
 * Format an error for consistent logging and response
 * @param error - The error to format
 * @param context - Optional context about where the error occurred
 * @returns Formatted error message
 */
export function formatError(error: any, context?: string): string {
    const message = error?.message || String(error) || 'Unknown error'
    return context ? `${context}: ${message}` : message
}

/**
 * Create an error result from a caught error
 * @param error - The caught error
 * @param fallbackMessage - Message to use if error has no message
 * @returns ToolResult with the error
 */
export function createErrorFromCatch(error: any, fallbackMessage: string): ToolResult {
    return createErrorResult(error?.message || fallbackMessage)
}

// Calculator Tool - Evaluate mathematical expressions safely

import type { ToolResult } from './types'

interface CalculatorArgs {
    expression: string
}

export async function executeCalculator(args: CalculatorArgs): Promise<ToolResult> {
    const { expression } = args
    
    if (!expression || typeof expression !== 'string') {
        return {
            success: false,
            error: 'Expression is required and must be a string'
        }
    }
    
    try {
        const result = evaluateMathExpression(expression)
        
        return {
            success: true,
            data: {
                expression,
                result,
                formatted: formatNumber(result)
            }
        }
    } catch (error: any) {
        return {
            success: false,
            error: `Invalid expression: ${error.message}`
        }
    }
}

/**
 * Safely evaluate a mathematical expression
 * Supports: +, -, *, /, ^, (), sqrt, sin, cos, tan, log, ln, abs, round, floor, ceil, pi, e
 */
function evaluateMathExpression(expr: string): number {
    // Sanitize and prepare expression
    let sanitized = expr
        .toLowerCase()
        .trim()
        // Replace common function names with Math equivalents
        .replace(/\bsqrt\b/g, 'Math.sqrt')
        .replace(/\bsin\b/g, 'Math.sin')
        .replace(/\bcos\b/g, 'Math.cos')
        .replace(/\btan\b/g, 'Math.tan')
        .replace(/\basin\b/g, 'Math.asin')
        .replace(/\bacos\b/g, 'Math.acos')
        .replace(/\batan\b/g, 'Math.atan')
        .replace(/\blog10\b/g, 'Math.log10')
        .replace(/\blog\b/g, 'Math.log10')  // log defaults to base 10
        .replace(/\bln\b/g, 'Math.log')      // ln is natural log
        .replace(/\babs\b/g, 'Math.abs')
        .replace(/\bround\b/g, 'Math.round')
        .replace(/\bfloor\b/g, 'Math.floor')
        .replace(/\bceil\b/g, 'Math.ceil')
        .replace(/\bexp\b/g, 'Math.exp')
        .replace(/\bpow\b/g, 'Math.pow')
        .replace(/\bmin\b/g, 'Math.min')
        .replace(/\bmax\b/g, 'Math.max')
        // Replace constants
        .replace(/\bpi\b/g, 'Math.PI')
        .replace(/\be\b(?![a-z])/g, 'Math.E')
        // Replace ^ with ** for exponentiation
        .replace(/\^/g, '**')
        // Replace × and ÷ with * and /
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
    
    // Validate: only allow safe characters
    // Allowed: numbers, operators, parentheses, Math functions, whitespace
    const allowedPattern = /^[\d+\-*/().Math,\s\w]+$/
    if (!allowedPattern.test(sanitized)) {
        throw new Error('Expression contains invalid characters')
    }
    
    // Additional safety: block dangerous patterns
    const dangerousPatterns = [
        /\beval\b/,
        /\bfunction\b/,
        /\breturn\b/,
        /\bwhile\b/,
        /\bfor\b/,
        /\bif\b/,
        /\bvar\b/,
        /\blet\b/,
        /\bconst\b/,
        /\bimport\b/,
        /\brequire\b/,
        /\bprocess\b/,
        /\bglobal\b/,
        /\bwindow\b/,
        /\bdocument\b/,
        /\[\s*\]/,      // Array access
        /\{\s*\}/,      // Object literals
    ]
    
    for (const pattern of dangerousPatterns) {
        if (pattern.test(sanitized)) {
            throw new Error('Expression contains disallowed keywords')
        }
    }
    
    // Use Function constructor (safer than eval, isolated scope)
    try {
        const fn = new Function(`"use strict"; return (${sanitized})`)
        const result = fn()
        
        if (typeof result !== 'number' || !isFinite(result)) {
            throw new Error('Result is not a valid number')
        }
        
        return result
    } catch (e: any) {
        throw new Error(e.message || 'Failed to evaluate expression')
    }
}

/**
 * Format a number for display
 */
function formatNumber(num: number): string {
    // Handle very large or very small numbers with scientific notation
    if (Math.abs(num) >= 1e10 || (Math.abs(num) < 1e-6 && num !== 0)) {
        return num.toExponential(6)
    }
    
    // Handle integers
    if (Number.isInteger(num)) {
        return num.toLocaleString()
    }
    
    // Handle decimals - limit to reasonable precision
    const str = num.toString()
    const decimalPlaces = str.includes('.') ? str.split('.')[1].length : 0
    
    if (decimalPlaces > 10) {
        return num.toFixed(10).replace(/\.?0+$/, '')
    }
    
    return num.toString()
}


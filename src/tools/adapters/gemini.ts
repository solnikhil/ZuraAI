// Google Gemini Function Calling Adapter
// Converts tool definitions to Gemini's format

import { ToolDefinition } from '../definitions'

/**
 * Gemini function declaration format
 */
export interface GeminiFunctionDeclaration {
    name: string
    description: string
    parameters: {
        type: 'object'
        properties: Record<string, any>
        required: string[]
    }
}

/**
 * Gemini tools format (wraps function declarations)
 */
export interface GeminiTools {
    function_declarations: GeminiFunctionDeclaration[]
}

/**
 * Convert Zura tool definitions to Gemini format
 */
export function convertToGeminiFormat(tools: ToolDefinition[]): GeminiTools {
    return {
        function_declarations: tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: {
                type: 'object',
                properties: Object.fromEntries(
                    Object.entries(tool.parameters.properties).map(([key, value]) => [
                        key,
                        {
                            type: value.type.toUpperCase(),  // Gemini uses uppercase types
                            description: value.description,
                            ...(value.enum && { enum: value.enum })
                        }
                    ])
                ),
                required: tool.parameters.required
            }
        }))
    }
}

/**
 * Parse function calls from Gemini response
 */
export function parseGeminiFunctionCalls(response: any): Array<{ id: string; name: string; arguments: Record<string, any> }> {
    const parts = response.candidates?.[0]?.content?.parts || []
    
    const functionCalls = parts
        .filter((part: any) => part.functionCall)
        .map((part: any, index: number) => ({
            id: `gemini_${Date.now()}_${index}`,
            name: part.functionCall.name,
            arguments: part.functionCall.args || {}
        }))
    
    return functionCalls
}

/**
 * Format tool results for sending back to Gemini
 */
export function formatToolResultsForGemini(
    functionCalls: Array<{ name: string }>,
    results: Array<{ success: boolean; data?: any; error?: string }>
): Array<{ functionResponse: { name: string; response: any } }> {
    return functionCalls.map((fc, i) => ({
        functionResponse: {
            name: fc.name,
            response: results[i].success
                ? { result: results[i].data }
                : { error: results[i].error }
        }
    }))
}

/**
 * Check if Gemini response contains function calls
 */
export function hasGeminiFunctionCalls(response: any): boolean {
    const parts = response.candidates?.[0]?.content?.parts || []
    return parts.some((part: any) => part.functionCall)
}

/**
 * Get the finish reason from Gemini response
 */
export function getGeminiFinishReason(response: any): string | undefined {
    return response.candidates?.[0]?.finishReason
}


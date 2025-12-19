// Clipboard Tool - Read and write system clipboard

import { clipboard } from 'electron'
import type { ToolResult } from './types'

/**
 * Read text from the system clipboard
 */
export async function executeReadClipboard(): Promise<ToolResult> {
    try {
        const text = clipboard.readText()
        
        if (!text) {
            return {
                success: true,
                data: {
                    content: '',
                    isEmpty: true,
                    message: 'Clipboard is empty or contains non-text content'
                }
            }
        }
        
        return {
            success: true,
            data: {
                content: text,
                isEmpty: false,
                length: text.length,
                preview: text.length > 200 ? text.slice(0, 200) + '...' : text
            }
        }
    } catch (error: any) {
        return {
            success: false,
            error: error.message || 'Failed to read clipboard'
        }
    }
}

interface WriteClipboardArgs {
    text: string
}

/**
 * Write text to the system clipboard
 */
export async function executeWriteClipboard(args: WriteClipboardArgs): Promise<ToolResult> {
    const { text } = args
    
    if (typeof text !== 'string') {
        return {
            success: false,
            error: 'Text must be a string'
        }
    }
    
    try {
        clipboard.writeText(text)
        
        return {
            success: true,
            data: {
                copied: true,
                length: text.length,
                preview: text.length > 100 ? text.slice(0, 100) + '...' : text
            }
        }
    } catch (error: any) {
        return {
            success: false,
            error: error.message || 'Failed to write to clipboard'
        }
    }
}


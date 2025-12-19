// Keyboard Control Tools
// Phase 1.2: Core Computer Control

import * as robot from 'robotjs'
import { ToolResult } from '../types'

/**
 * Type text character by character
 */
export async function executeTypeText(args: { text: string; delay?: number }): Promise<ToolResult> {
    try {
        const { text, delay = 10 } = args
        
        if (typeof text !== 'string') {
            return { success: false, error: 'text must be a string' }
        }
        
        if (typeof delay !== 'number' || delay < 0) {
            return { success: false, error: 'delay must be a non-negative number' }
        }
        
        // robotjs typeString doesn't support delay parameter directly
        // We'll type character by character with delay
        for (let i = 0; i < text.length; i++) {
            robot.typeString(text[i])
            if (delay > 0 && i < text.length - 1) {
                await new Promise(resolve => setTimeout(resolve, delay))
            }
        }
        
        return {
            success: true,
            data: { text, delay, message: `Typed text: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"` }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to type text' }
    }
}

/**
 * Press a single key
 */
export async function executePressKey(args: { key: string }): Promise<ToolResult> {
    try {
        const { key } = args
        
        if (typeof key !== 'string') {
            return { success: false, error: 'key must be a string' }
        }
        
        // Map common key names to robotjs format
        const keyMap: Record<string, string> = {
            'enter': 'enter',
            'return': 'enter',
            'tab': 'tab',
            'escape': 'escape',
            'esc': 'escape',
            'backspace': 'backspace',
            'delete': 'delete',
            'space': 'space',
            'up': 'up',
            'down': 'down',
            'left': 'left',
            'right': 'right',
            'home': 'home',
            'end': 'end',
            'pageup': 'pageup',
            'pagedown': 'pagedown',
            'f1': 'f1', 'f2': 'f2', 'f3': 'f3', 'f4': 'f4',
            'f5': 'f5', 'f6': 'f6', 'f7': 'f7', 'f8': 'f8',
            'f9': 'f9', 'f10': 'f10', 'f11': 'f11', 'f12': 'f12'
        }
        
        const robotKey = keyMap[key.toLowerCase()] || key.toLowerCase()
        
        robot.keyTap(robotKey)
        
        return {
            success: true,
            data: { key, message: `Pressed key: ${key}` }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to press key' }
    }
}

/**
 * Press a hotkey combination (e.g., Ctrl+C, Alt+Tab)
 */
export async function executeHotkey(args: { modifiers: string[]; key: string }): Promise<ToolResult> {
    try {
        const { modifiers, key } = args
        
        if (!Array.isArray(modifiers)) {
            return { success: false, error: 'modifiers must be an array' }
        }
        
        if (typeof key !== 'string') {
            return { success: false, error: 'key must be a string' }
        }
        
        // Map modifier names to robotjs format
        const modifierMap: Record<string, string> = {
            'ctrl': 'control',
            'control': 'control',
            'alt': 'alt',
            'shift': 'shift',
            'meta': 'command',
            'win': 'command',
            'windows': 'command'
        }
        
        const robotModifiers = modifiers.map(m => modifierMap[m.toLowerCase()] || m.toLowerCase())
        const robotKey = key.toLowerCase()
        
        robot.keyTap(robotKey, robotModifiers)
        
        return {
            success: true,
            data: { 
                modifiers, 
                key, 
                message: `Pressed hotkey: ${modifiers.join('+')}+${key}` 
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to press hotkey' }
    }
}

/**
 * Hold a key for specified duration
 */
export async function executeHoldKey(args: { key: string; duration: number }): Promise<ToolResult> {
    try {
        const { key, duration } = args
        
        if (typeof key !== 'string') {
            return { success: false, error: 'key must be a string' }
        }
        
        if (typeof duration !== 'number' || duration <= 0) {
            return { success: false, error: 'duration must be a positive number (milliseconds)' }
        }
        
        const robotKey = key.toLowerCase()
        
        robot.keyToggle(robotKey, 'down')
        await new Promise(resolve => setTimeout(resolve, duration))
        robot.keyToggle(robotKey, 'up')
        
        return {
            success: true,
            data: { key, duration, message: `Held key ${key} for ${duration}ms` }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to hold key' }
    }
}


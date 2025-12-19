// Mouse Control Tools
// Phase 1.1: Core Computer Control

import * as robot from 'robotjs'
import { ToolResult } from '../types'

/**
 * Move mouse cursor to specified coordinates
 */
export async function executeMoveMouse(args: { x: number; y: number }): Promise<ToolResult> {
    try {
        const { x, y } = args
        
        if (typeof x !== 'number' || typeof y !== 'number') {
            return { success: false, error: 'x and y must be numbers' }
        }
        
        robot.moveMouse(x, y)
        
        return {
            success: true,
            data: { x, y, message: `Mouse moved to (${x}, ${y})` }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to move mouse' }
    }
}

/**
 * Click at specified coordinates
 */
export async function executeClick(args: { x: number; y: number; button?: 'left' | 'right' | 'middle' }): Promise<ToolResult> {
    try {
        const { x, y, button = 'left' } = args
        
        if (typeof x !== 'number' || typeof y !== 'number') {
            return { success: false, error: 'x and y must be numbers' }
        }
        
        robot.moveMouse(x, y)
        
        // Map button to robotjs button type
        if (button === 'right') {
            robot.mouseClick('right')
        } else if (button === 'middle') {
            robot.mouseClick('middle')
        } else {
            robot.mouseClick()
        }
        
        return {
            success: true,
            data: { x, y, button, message: `Clicked ${button} button at (${x}, ${y})` }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to click' }
    }
}

/**
 * Double click at specified coordinates
 */
export async function executeDoubleClick(args: { x: number; y: number }): Promise<ToolResult> {
    try {
        const { x, y } = args
        
        if (typeof x !== 'number' || typeof y !== 'number') {
            return { success: false, error: 'x and y must be numbers' }
        }
        
        robot.moveMouse(x, y)
        robot.mouseClick()
        robot.mouseClick()
        
        return {
            success: true,
            data: { x, y, message: `Double clicked at (${x}, ${y})` }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to double click' }
    }
}

/**
 * Drag from start to end coordinates
 */
export async function executeDrag(args: { startX: number; startY: number; endX: number; endY: number }): Promise<ToolResult> {
    try {
        const { startX, startY, endX, endY } = args
        
        if (typeof startX !== 'number' || typeof startY !== 'number' || 
            typeof endX !== 'number' || typeof endY !== 'number') {
            return { success: false, error: 'All coordinates must be numbers' }
        }
        
        robot.moveMouse(startX, startY)
        robot.mouseToggle('down')
        robot.dragMouse(endX, endY)
        robot.mouseToggle('up')
        
        return {
            success: true,
            data: { 
                start: { x: startX, y: startY },
                end: { x: endX, y: endY },
                message: `Dragged from (${startX}, ${startY}) to (${endX}, ${endY})`
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to drag' }
    }
}

/**
 * Scroll in specified direction
 */
export async function executeScroll(args: { direction: 'up' | 'down' | 'left' | 'right'; amount?: number }): Promise<ToolResult> {
    try {
        const { direction, amount = 3 } = args
        
        if (typeof amount !== 'number' || amount <= 0) {
            return { success: false, error: 'amount must be a positive number' }
        }
        
        // robotjs scrolls in pixels, positive = up, negative = down
        let scrollAmount = 0
        if (direction === 'up') {
            scrollAmount = amount
        } else if (direction === 'down') {
            scrollAmount = -amount
        } else if (direction === 'left') {
            // Horizontal scroll (may not be supported on all systems)
            robot.scrollMouse(0, amount)
            return {
                success: true,
                data: { direction, amount, message: `Scrolled ${direction} by ${amount} pixels` }
            }
        } else if (direction === 'right') {
            robot.scrollMouse(0, -amount)
            return {
                success: true,
                data: { direction, amount, message: `Scrolled ${direction} by ${amount} pixels` }
            }
        }
        
        robot.scrollMouse(scrollAmount, 0)
        
        return {
            success: true,
            data: { direction, amount, message: `Scrolled ${direction} by ${amount} pixels` }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to scroll' }
    }
}


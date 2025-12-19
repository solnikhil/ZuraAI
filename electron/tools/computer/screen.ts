// Screen Understanding Tools
// Phase 1.3: Core Computer Control

import { screen, nativeImage } from 'electron'
import { createWorker } from 'tesseract.js'
import * as robot from 'robotjs'
import { ToolResult } from '../types'
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

let ocrWorker: any = null

/**
 * Initialize OCR worker (lazy load)
 */
async function getOCRWorker() {
    if (!ocrWorker) {
        ocrWorker = await createWorker('eng')
    }
    return ocrWorker
}

/**
 * Capture full screen
 */
export async function executeCaptureScreen(args: {}): Promise<ToolResult> {
    try {
        const displays = screen.getAllDisplays()
        const primaryDisplay = displays[0]
        
        const { width, height } = primaryDisplay.size
        const bitmap = robot.screen.capture(0, 0, width, height)
        
        // Convert bitmap to base64
        const image = nativeImage.createFromBuffer(Buffer.from(bitmap.image))
        const base64 = image.toDataURL()
        
        return {
            success: true,
            data: { 
                width, 
                height, 
                image: base64,
                message: `Captured screen: ${width}x${height}` 
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to capture screen' }
    }
}

/**
 * Capture a specific region
 */
export async function executeCaptureRegion(args: { x: number; y: number; width: number; height: number }): Promise<ToolResult> {
    try {
        const { x, y, width, height } = args
        
        if (typeof x !== 'number' || typeof y !== 'number' || 
            typeof width !== 'number' || typeof height !== 'number') {
            return { success: false, error: 'x, y, width, and height must be numbers' }
        }
        
        if (width <= 0 || height <= 0) {
            return { success: false, error: 'width and height must be positive' }
        }
        
        const bitmap = robot.screen.capture(x, y, width, height)
        const image = nativeImage.createFromBuffer(Buffer.from(bitmap.image))
        const base64 = image.toDataURL()
        
        return {
            success: true,
            data: { 
                x, y, width, height,
                image: base64,
                message: `Captured region: ${width}x${height} at (${x}, ${y})` 
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to capture region' }
    }
}

/**
 * Get text from screen using OCR
 */
export async function executeGetScreenText(args: {}): Promise<ToolResult> {
    try {
        const displays = screen.getAllDisplays()
        const primaryDisplay = displays[0]
        const { width, height } = primaryDisplay.size
        
        const bitmap = robot.screen.capture(0, 0, width, height)
        const image = nativeImage.createFromBuffer(Buffer.from(bitmap.image))
        
        const worker = await getOCRWorker()
        const { data: { text } } = await worker.recognize(image.toPNG())
        
        return {
            success: true,
            data: { 
                text: text.trim(),
                message: `Extracted ${text.length} characters from screen` 
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to extract text' }
    }
}

/**
 * Get text from a specific region using OCR
 */
export async function executeGetTextAt(args: { x: number; y: number; width: number; height: number }): Promise<ToolResult> {
    try {
        const { x, y, width, height } = args
        
        if (typeof x !== 'number' || typeof y !== 'number' || 
            typeof width !== 'number' || typeof height !== 'number') {
            return { success: false, error: 'x, y, width, and height must be numbers' }
        }
        
        if (width <= 0 || height <= 0) {
            return { success: false, error: 'width and height must be positive' }
        }
        
        const bitmap = robot.screen.capture(x, y, width, height)
        const image = nativeImage.createFromBuffer(Buffer.from(bitmap.image))
        
        const worker = await getOCRWorker()
        const { data: { text } } = await worker.recognize(image.toPNG())
        
        return {
            success: true,
            data: { 
                x, y, width, height,
                text: text.trim(),
                message: `Extracted ${text.length} characters from region` 
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to extract text from region' }
    }
}

/**
 * Find element on screen using AI vision (placeholder - requires vision API integration)
 */
export async function executeFindElement(args: { description: string }): Promise<ToolResult> {
    try {
        const { description } = args
        
        if (typeof description !== 'string') {
            return { success: false, error: 'description must be a string' }
        }
        
        // This would require integration with vision models (GPT-4V, Gemini Vision)
        // For now, return a placeholder response
        return {
            success: false,
            error: 'Element finding requires vision model integration. Use capture_screen and analyze with AI instead.'
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to find element' }
    }
}


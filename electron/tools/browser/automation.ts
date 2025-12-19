// Browser Automation Tools
// Phase 5.1: Advanced Features

import { chromium, Browser, Page } from 'playwright'
import { ToolResult } from '../types'

let browser: Browser | null = null
let pages: Map<string, Page> = new Map()

/**
 * Get or create browser instance
 */
async function getBrowser(): Promise<Browser> {
    if (!browser) {
        browser = await chromium.launch({
            headless: false // Show browser for user visibility
        })
    }
    return browser
}

/**
 * Open URL in browser
 */
export async function executeOpenUrl(args: { url: string; newTab?: boolean }): Promise<ToolResult> {
    try {
        const { url, newTab = false } = args
        
        if (typeof url !== 'string') {
            return { success: false, error: 'url must be a string' }
        }
        
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            return { success: false, error: 'url must start with http:// or https://' }
        }
        
        const browserInstance = await getBrowser()
        const page = await browserInstance.newPage()
        await page.goto(url)
        
        const pageId = `page_${Date.now()}`
        pages.set(pageId, page)
        
        return {
            success: true,
            data: {
                pageId,
                url,
                message: `Opened URL: ${url}`
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to open URL' }
    }
}

/**
 * Navigate to URL in existing page
 */
export async function executeNavigateTo(args: { pageId: string; url: string }): Promise<ToolResult> {
    try {
        const { pageId, url } = args
        
        if (typeof pageId !== 'string' || typeof url !== 'string') {
            return { success: false, error: 'pageId and url must be strings' }
        }
        
        const page = pages.get(pageId)
        if (!page) {
            return { success: false, error: `Page not found: ${pageId}` }
        }
        
        await page.goto(url)
        
        return {
            success: true,
            data: {
                pageId,
                url,
                message: `Navigated to: ${url}`
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to navigate' }
    }
}

/**
 * Click element by CSS selector
 */
export async function executeClickElement(args: { pageId: string; selector: string }): Promise<ToolResult> {
    try {
        const { pageId, selector } = args
        
        if (typeof pageId !== 'string' || typeof selector !== 'string') {
            return { success: false, error: 'pageId and selector must be strings' }
        }
        
        const page = pages.get(pageId)
        if (!page) {
            return { success: false, error: `Page not found: ${pageId}` }
        }
        
        await page.click(selector)
        
        return {
            success: true,
            data: {
                pageId,
                selector,
                message: `Clicked element: ${selector}`
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to click element' }
    }
}

/**
 * Type text into element
 */
export async function executeTypeInElement(args: { pageId: string; selector: string; text: string }): Promise<ToolResult> {
    try {
        const { pageId, selector, text } = args
        
        if (typeof pageId !== 'string' || typeof selector !== 'string' || typeof text !== 'string') {
            return { success: false, error: 'pageId, selector, and text must be strings' }
        }
        
        const page = pages.get(pageId)
        if (!page) {
            return { success: false, error: `Page not found: ${pageId}` }
        }
        
        await page.fill(selector, text)
        
        return {
            success: true,
            data: {
                pageId,
                selector,
                textLength: text.length,
                message: `Typed text into: ${selector}`
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to type in element' }
    }
}

/**
 * Get page content
 */
export async function executeGetPageContent(args: { pageId: string; format?: 'text' | 'html' }): Promise<ToolResult> {
    try {
        const { pageId, format = 'text' } = args
        
        if (typeof pageId !== 'string') {
            return { success: false, error: 'pageId must be a string' }
        }
        
        const page = pages.get(pageId)
        if (!page) {
            return { success: false, error: `Page not found: ${pageId}` }
        }
        
        let content: string
        if (format === 'html') {
            content = await page.content()
        } else {
            content = await page.textContent('body') || ''
        }
        
        return {
            success: true,
            data: {
                pageId,
                format,
                content,
                length: content.length,
                message: `Retrieved ${format} content (${content.length} chars)`
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to get page content' }
    }
}

/**
 * Wait for element to appear
 */
export async function executeWaitForElement(args: { pageId: string; selector: string; timeout?: number }): Promise<ToolResult> {
    try {
        const { pageId, selector, timeout = 30000 } = args
        
        if (typeof pageId !== 'string' || typeof selector !== 'string') {
            return { success: false, error: 'pageId and selector must be strings' }
        }
        
        const page = pages.get(pageId)
        if (!page) {
            return { success: false, error: `Page not found: ${pageId}` }
        }
        
        await page.waitForSelector(selector, { timeout })
        
        return {
            success: true,
            data: {
                pageId,
                selector,
                message: `Element appeared: ${selector}`
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to wait for element' }
    }
}

/**
 * Extract data using selectors
 */
export async function executeExtractData(args: { pageId: string; selectors: Record<string, string> }): Promise<ToolResult> {
    try {
        const { pageId, selectors } = args
        
        if (typeof pageId !== 'string' || typeof selectors !== 'object') {
            return { success: false, error: 'pageId must be a string and selectors must be an object' }
        }
        
        const page = pages.get(pageId)
        if (!page) {
            return { success: false, error: `Page not found: ${pageId}` }
        }
        
        const data: Record<string, string> = {}
        
        for (const [key, selector] of Object.entries(selectors)) {
            try {
                const element = await page.$(selector)
                if (element) {
                    data[key] = await element.textContent() || ''
                } else {
                    data[key] = ''
                }
            } catch (err) {
                data[key] = ''
            }
        }
        
        return {
            success: true,
            data: {
                pageId,
                extracted: data,
                message: `Extracted data using ${Object.keys(selectors).length} selectors`
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to extract data' }
    }
}


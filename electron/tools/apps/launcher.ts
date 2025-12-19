// Application Management Tools
// Phase 2.1: Application & System Control

import { exec } from 'child_process'
import { promisify } from 'util'
import * as activeWin from 'active-win'
import { ToolResult } from '../types'

const execAsync = promisify(exec)

/**
 * Launch an application by name or path
 */
export async function executeLaunchApp(args: { name_or_path: string }): Promise<ToolResult> {
    try {
        const { name_or_path } = args

        if (typeof name_or_path !== 'string') {
            return { success: false, error: 'name_or_path must be a string' }
        }

        // Try to launch the application
        // On Windows, use 'start' command
        await execAsync(`start "" "${name_or_path}"`)

        // Wait a moment for the app to launch
        await new Promise(resolve => setTimeout(resolve, 500))

        return {
            success: true,
            data: {
                app: name_or_path,
                message: `Launched application: ${name_or_path}`
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to launch application' }
    }
}

/**
 * Close an application by name
 */
export async function executeCloseApp(args: { name: string }): Promise<ToolResult> {
    try {
        const { name } = args

        if (typeof name !== 'string') {
            return { success: false, error: 'name must be a string' }
        }

        // On Windows, use taskkill to close the application
        await execAsync(`taskkill /IM "${name}.exe" /F`)

        return {
            success: true,
            data: {
                app: name,
                message: `Closed application: ${name}`
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to close application' }
    }
}

/**
 * List all running applications
 */
export async function executeListRunningApps(args: {}): Promise<ToolResult> {
    try {
        // On Windows, use tasklist to get running processes
        const { stdout } = await execAsync('tasklist /FO CSV')

        const lines = stdout.split('\n').slice(1).filter(line => line.trim())
        const apps = lines.map(line => {
            const match = line.match(/"([^"]+)"/)
            return match ? match[1].replace('.exe', '') : null
        }).filter(Boolean) as string[]

        // Remove duplicates and sort (avoiding Set spread for compatibility)
        const uniqueApps = Array.from(new Set(apps)).sort()

        return {
            success: true,
            data: {
                apps: uniqueApps,
                count: uniqueApps.length,
                message: `Found ${uniqueApps.length} running applications`
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to list applications' }
    }
}


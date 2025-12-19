// Window Management Tools
// Phase 2.1: Application & System Control

import { exec } from 'child_process'
import { promisify } from 'util'
import { ToolResult } from '../types'

// Use require for active-win due to ESM compatibility issues
// eslint-disable-next-line @typescript-eslint/no-var-requires
const activeWin = require('active-win')

const execAsync = promisify(exec)

/**
 * Focus a window by title
 */
export async function executeFocusWindow(args: { title: string }): Promise<ToolResult> {
    try {
        const { title } = args

        if (typeof title !== 'string') {
            return { success: false, error: 'title must be a string' }
        }

        // On Windows, use PowerShell to focus window
        const script = `
            Add-Type @"
                using System;
                using System.Runtime.InteropServices;
                public class Win32 {
                    [DllImport("user32.dll")]
                    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
                    [DllImport("user32.dll")]
                    public static extern bool SetForegroundWindow(IntPtr hWnd);
                    [DllImport("user32.dll")]
                    public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
                }
"@
            $hwnd = [Win32]::FindWindow($null, "${title}")
            if ($hwnd -ne [IntPtr]::Zero) {
                [Win32]::ShowWindow($hwnd, 9)
                [Win32]::SetForegroundWindow($hwnd)
            }
        `

        await execAsync(`powershell -Command "${script.replace(/"/g, '\\"')}"`)

        return {
            success: true,
            data: {
                title,
                message: `Focused window: ${title}`
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to focus window' }
    }
}

/**
 * Minimize a window
 */
export async function executeMinimizeWindow(args: { title: string }): Promise<ToolResult> {
    try {
        const { title } = args

        if (typeof title !== 'string') {
            return { success: false, error: 'title must be a string' }
        }

        const script = `
            Add-Type @"
                using System;
                using System.Runtime.InteropServices;
                public class Win32 {
                    [DllImport("user32.dll")]
                    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
                    [DllImport("user32.dll")]
                    public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
                }
"@
            $hwnd = [Win32]::FindWindow($null, "${title}")
            if ($hwnd -ne [IntPtr]::Zero) {
                [Win32]::ShowWindow($hwnd, 6)
            }
        `

        await execAsync(`powershell -Command "${script.replace(/"/g, '\\"')}"`)

        return {
            success: true,
            data: {
                title,
                message: `Minimized window: ${title}`
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to minimize window' }
    }
}

/**
 * Maximize a window
 */
export async function executeMaximizeWindow(args: { title: string }): Promise<ToolResult> {
    try {
        const { title } = args

        if (typeof title !== 'string') {
            return { success: false, error: 'title must be a string' }
        }

        const script = `
            Add-Type @"
                using System;
                using System.Runtime.InteropServices;
                public class Win32 {
                    [DllImport("user32.dll")]
                    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
                    [DllImport("user32.dll")]
                    public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
                }
"@
            $hwnd = [Win32]::FindWindow($null, "${title}")
            if ($hwnd -ne [IntPtr]::Zero) {
                [Win32]::ShowWindow($hwnd, 3)
            }
        `

        await execAsync(`powershell -Command "${script.replace(/"/g, '\\"')}"`)

        return {
            success: true,
            data: {
                title,
                message: `Maximized window: ${title}`
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to maximize window' }
    }
}

/**
 * List all open windows
 */
export async function executeListWindows(args: {}): Promise<ToolResult> {
    try {
        // Get active window using active-win
        const activeWindow = await activeWin()

        // Get all windows using PowerShell
        const script = `
            Add-Type @"
                using System;
                using System.Runtime.InteropServices;
                using System.Text;
                public class Win32 {
                    [DllImport("user32.dll")]
                    public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);
                    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
                    [DllImport("user32.dll")]
                    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
                    [DllImport("user32.dll")]
                    public static extern bool IsWindowVisible(IntPtr hWnd);
                }
"@
            $windows = @()
            $callback = {
                param([IntPtr]$hWnd, [IntPtr]$lParam)
                if ([Win32]::IsWindowVisible($hWnd)) {
                    $sb = New-Object System.Text.StringBuilder 256
                    [Win32]::GetWindowText($hWnd, $sb, $sb.Capacity) | Out-Null
                    $title = $sb.ToString()
                    if ($title) {
                        $windows += $title
                    }
                }
                return $true
            }
            $delegate = [Win32+EnumWindowsProc]$callback
            [Win32]::EnumWindows($delegate, [IntPtr]::Zero) | Out-Null
            $windows | ConvertTo-Json
        `

        const { stdout } = await execAsync(`powershell -Command "${script.replace(/"/g, '\\"')}"`)
        const windowTitles = JSON.parse(stdout) as string[]

        return {
            success: true,
            data: {
                windows: windowTitles,
                count: windowTitles.length,
                message: `Found ${windowTitles.length} open windows`
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to list windows' }
    }
}

/**
 * Get active window information
 */
export async function executeGetActiveWindow(args: {}): Promise<ToolResult> {
    try {
        const window = await activeWin()

        if (!window) {
            return { success: false, error: 'Could not get active window' }
        }

        return {
            success: true,
            data: {
                title: window.title,
                owner: window.owner?.name,
                bounds: window.bounds,
                message: `Active window: ${window.title}`
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to get active window' }
    }
}


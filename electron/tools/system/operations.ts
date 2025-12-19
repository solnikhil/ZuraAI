// System Operations Tools
// Phase 2.3: Application & System Control

import { exec } from 'child_process'
import { promisify } from 'util'
import * as os from 'os'
import { ToolResult } from '../types'

const execAsync = promisify(exec)

/**
 * Execute a shell command
 */
export async function executeRunCommand(args: { cmd: string }): Promise<ToolResult> {
    try {
        const { cmd } = args
        
        if (typeof cmd !== 'string') {
            return { success: false, error: 'cmd must be a string' }
        }
        
        // Security: Block dangerous commands
        const dangerousCommands = ['format', 'del /f', 'rm -rf', 'shutdown', 'restart']
        const lowerCmd = cmd.toLowerCase()
        if (dangerousCommands.some(danger => lowerCmd.includes(danger))) {
            return { success: false, error: 'Command blocked for safety' }
        }
        
        const { stdout, stderr } = await execAsync(cmd, { timeout: 30000 })
        
        return {
            success: true,
            data: { 
                command: cmd,
                output: stdout,
                error: stderr || undefined,
                message: `Executed command: ${cmd}` 
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to execute command' }
    }
}

/**
 * Get system information
 */
export async function executeGetSystemInfo(args: {}): Promise<ToolResult> {
    try {
        const info = {
            platform: os.platform(),
            arch: os.arch(),
            hostname: os.hostname(),
            cpus: os.cpus().length,
            totalMemory: os.totalmem(),
            freeMemory: os.freemem(),
            uptime: os.uptime(),
            type: os.type(),
            release: os.release(),
            version: os.version()
        }
        
        return {
            success: true,
            data: { 
                ...info,
                message: `System: ${info.type} ${info.release} (${info.arch})` 
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to get system info' }
    }
}

/**
 * Get running processes
 */
export async function executeGetRunningProcesses(args: {}): Promise<ToolResult> {
    try {
        // On Windows, use tasklist
        const { stdout } = await execAsync('tasklist /FO CSV')
        
        const lines = stdout.split('\n').slice(1).filter(line => line.trim())
        const processes = lines.map(line => {
            const parts = line.match(/"([^"]+)"/g)
            if (parts && parts.length >= 2) {
                return {
                    name: parts[0].replace(/"/g, ''),
                    pid: parts[1].replace(/"/g, ''),
                    memory: parts[4] ? parts[4].replace(/"/g, '') : 'N/A'
                }
            }
            return null
        }).filter(Boolean)
        
        return {
            success: true,
            data: { 
                processes,
                count: processes.length,
                message: `Found ${processes.length} running processes` 
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to get processes' }
    }
}

/**
 * Kill a process
 */
export async function executeKillProcess(args: { name_or_pid: string }): Promise<ToolResult> {
    try {
        const { name_or_pid } = args
        
        if (typeof name_or_pid !== 'string') {
            return { success: false, error: 'name_or_pid must be a string' }
        }
        
        // Check if it's a PID (numeric) or process name
        const isPid = /^\d+$/.test(name_or_pid)
        
        if (isPid) {
            await execAsync(`taskkill /PID ${name_or_pid} /F`)
        } else {
            await execAsync(`taskkill /IM "${name_or_pid}" /F`)
        }
        
        return {
            success: true,
            data: { 
                process: name_or_pid,
                message: `Killed process: ${name_or_pid}` 
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to kill process' }
    }
}


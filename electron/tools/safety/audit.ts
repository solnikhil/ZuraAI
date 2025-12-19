// Safety Guardrails & Audit Logging
// Phase 4.1: Safety & User Experience

import * as path from 'path'
import { app } from 'electron'
import { ToolResult } from '../types'

// Use require for better-sqlite3 due to ESM compatibility issues
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Database = require('better-sqlite3')

let auditDb: ReturnType<typeof Database> | null = null

/**
 * Initialize audit database
 */
function getAuditDatabase(): ReturnType<typeof Database> {
    if (!auditDb) {
        const dbPath = path.join(app.getPath('userData'), 'zura_audit.db')
        auditDb = new Database(dbPath)
        
        auditDb.exec(`
            CREATE TABLE IF NOT EXISTS audit_log (
                id TEXT PRIMARY KEY,
                timestamp INTEGER NOT NULL,
                tool_name TEXT NOT NULL,
                args TEXT NOT NULL,
                result TEXT,
                success INTEGER NOT NULL,
                user_approved INTEGER NOT NULL,
                session_id TEXT
            );
            
            CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
            CREATE INDEX IF NOT EXISTS idx_audit_tool ON audit_log(tool_name);
        `)
    }
    return auditDb
}

/**
 * Log an action to audit log
 */
export async function executeLogAction(args: { toolName: string; args: Record<string, any>; result: any; success: boolean; userApproved: boolean; sessionId?: string }): Promise<ToolResult> {
    try {
        const { toolName, args: toolArgs, result, success, userApproved, sessionId } = args
        
        const db = getAuditDatabase()
        const id = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        
        db.prepare(`
            INSERT INTO audit_log (id, timestamp, tool_name, args, result, success, user_approved, session_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            id,
            Date.now(),
            toolName,
            JSON.stringify(toolArgs),
            JSON.stringify(result),
            success ? 1 : 0,
            userApproved ? 1 : 0,
            sessionId || null
        )
        
        return {
            success: true,
            data: {
                id,
                message: 'Action logged'
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to log action' }
    }
}

/**
 * Get audit log entries
 */
export async function executeGetAuditLog(args: { toolName?: string; limit?: number; since?: number }): Promise<ToolResult> {
    try {
        const { toolName, limit = 100, since } = args
        
        const db = getAuditDatabase()
        let sql = 'SELECT * FROM audit_log WHERE 1=1'
        const params: any[] = []
        
        if (toolName) {
            sql += ' AND tool_name = ?'
            params.push(toolName)
        }
        
        if (since) {
            sql += ' AND timestamp >= ?'
            params.push(since)
        }
        
        sql += ' ORDER BY timestamp DESC LIMIT ?'
        params.push(limit)
        
        const entries = db.prepare(sql).all(...params) as Array<{
            id: string
            timestamp: number
            tool_name: string
            args: string
            result: string
            success: number
            user_approved: number
            session_id: string | null
        }>
        
        return {
            success: true,
            data: {
                entries: entries.map(e => ({
                    id: e.id,
                    timestamp: e.timestamp,
                    toolName: e.tool_name,
                    args: JSON.parse(e.args),
                    result: JSON.parse(e.result || '{}'),
                    success: e.success === 1,
                    userApproved: e.user_approved === 1,
                    sessionId: e.session_id
                })),
                count: entries.length,
                message: `Found ${entries.length} audit log entries`
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to get audit log' }
    }
}

/**
 * Check if action requires approval based on restrictions
 */
export async function executeCheckRestrictions(args: { toolName: string; args: Record<string, any> }): Promise<ToolResult> {
    try {
        const { toolName, args: toolArgs } = args
        
        // Define restricted operations
        const restrictedPaths = [
            'C:\\Windows',
            'C:\\Program Files',
            'C:\\Program Files (x86)',
            'C:\\System32'
        ]
        
        const restrictedTools = ['delete_file', 'kill_process', 'run_command']
        
        // Check if tool is restricted
        if (restrictedTools.includes(toolName)) {
            // Check if it's trying to access restricted paths
            const pathArg = toolArgs.path || toolArgs.src || toolArgs.dest || toolArgs.name_or_path
            if (pathArg && typeof pathArg === 'string') {
                const normalizedPath = pathArg.toLowerCase()
                if (restrictedPaths.some(rp => normalizedPath.includes(rp.toLowerCase()))) {
                    return {
                        success: false,
                        data: {
                            requiresApproval: true,
                            blocked: true,
                            reason: 'Access to system directories is restricted'
                        },
                        error: 'Action blocked: Access to system directories is restricted'
                    }
                }
            }
            
            return {
                success: true,
                data: {
                    requiresApproval: true,
                    blocked: false,
                    reason: 'Tool requires user approval'
                }
            }
        }
        
        return {
            success: true,
            data: {
                requiresApproval: false,
                blocked: false
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to check restrictions' }
    }
}


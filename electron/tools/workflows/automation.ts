// Workflow Automation Tools
// Phase 5.2: Advanced Features

import { ToolResult } from '../types'
import { getDatabase as getDbConnection, DatabaseInstance } from '../utils/database'

// Database name constant
const DB_NAME = 'zura_workflows'

let initialized = false

/**
 * Get workflow database with schema initialization
 */
function getWorkflowDatabase(): DatabaseInstance {
    const db = getDbConnection(DB_NAME)
    
    if (!initialized) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS workflows (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                steps TEXT NOT NULL,
                triggers TEXT,
                schedule TEXT,
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            
            CREATE TABLE IF NOT EXISTS workflow_executions (
                id TEXT PRIMARY KEY,
                workflow_id TEXT NOT NULL,
                status TEXT NOT NULL,
                started_at INTEGER NOT NULL,
                completed_at INTEGER,
                result TEXT,
                FOREIGN KEY (workflow_id) REFERENCES workflows(id)
            );
            
            CREATE INDEX IF NOT EXISTS idx_executions_workflow ON workflow_executions(workflow_id);
            CREATE INDEX IF NOT EXISTS idx_executions_status ON workflow_executions(status);
        `)
        initialized = true
    }
    return db
}

/**
 * Record a workflow
 */
export async function executeRecordWorkflow(args: { name: string; steps: Array<{ tool: string; args: Record<string, any> }> }): Promise<ToolResult> {
    try {
        const { name, steps } = args
        
        if (typeof name !== 'string' || !Array.isArray(steps)) {
            return { success: false, error: 'name must be a string and steps must be an array' }
        }
        
        const db = getWorkflowDatabase()
        const id = `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        
        db.prepare(`
            INSERT INTO workflows (id, name, steps, enabled, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(id, name, JSON.stringify(steps), 1, Date.now(), Date.now())
        
        return {
            success: true,
            data: {
                id,
                name,
                stepCount: steps.length,
                message: `Recorded workflow: ${name}`
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to record workflow' }
    }
}

/**
 * Execute a workflow
 */
export async function executeExecuteWorkflow(args: { workflowId: string }): Promise<ToolResult> {
    try {
        const { workflowId } = args
        
        if (typeof workflowId !== 'string') {
            return { success: false, error: 'workflowId must be a string' }
        }
        
        const db = getWorkflowDatabase()
        const workflow = db.prepare('SELECT * FROM workflows WHERE id = ?').get(workflowId) as {
            id: string
            name: string
            steps: string
            enabled: number
        } | undefined
        
        if (!workflow) {
            return { success: false, error: `Workflow not found: ${workflowId}` }
        }
        
        if (workflow.enabled === 0) {
            return { success: false, error: 'Workflow is disabled' }
        }
        
        const steps = JSON.parse(workflow.steps)
        const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        
        db.prepare(`
            INSERT INTO workflow_executions (id, workflow_id, status, started_at)
            VALUES (?, ?, ?, ?)
        `).run(executionId, workflowId, 'running', Date.now())
        
        // Note: Actual execution would happen here via tool manager
        // This is a placeholder
        
        return {
            success: true,
            data: {
                executionId,
                workflowId,
                workflowName: workflow.name,
                stepCount: steps.length,
                message: `Executing workflow: ${workflow.name}`
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to execute workflow' }
    }
}

/**
 * List workflows
 */
export async function executeListWorkflows(args: {}): Promise<ToolResult> {
    try {
        const db = getWorkflowDatabase()
        const workflows = db.prepare('SELECT * FROM workflows ORDER BY updated_at DESC').all() as Array<{
            id: string
            name: string
            steps: string
            enabled: number
            created_at: number
        }>
        
        return {
            success: true,
            data: {
                workflows: workflows.map(w => ({
                    id: w.id,
                    name: w.name,
                    stepCount: JSON.parse(w.steps).length,
                    enabled: w.enabled === 1,
                    createdAt: w.created_at
                })),
                count: workflows.length,
                message: `Found ${workflows.length} workflows`
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to list workflows' }
    }
}

/**
 * Schedule a workflow
 */
export async function executeScheduleWorkflow(args: { workflowId: string; schedule: string }): Promise<ToolResult> {
    try {
        const { workflowId, schedule } = args
        
        if (typeof workflowId !== 'string' || typeof schedule !== 'string') {
            return { success: false, error: 'workflowId and schedule must be strings' }
        }
        
        const db = getWorkflowDatabase()
        db.prepare('UPDATE workflows SET schedule = ?, updated_at = ? WHERE id = ?').run(schedule, Date.now(), workflowId)
        
        return {
            success: true,
            data: {
                workflowId,
                schedule,
                message: `Scheduled workflow: ${workflowId}`
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to schedule workflow' }
    }
}


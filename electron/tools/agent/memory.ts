// Memory & Context System
// Phase 3.2: Intelligent Agent Capabilities

import { ToolResult } from '../types'
import { getDatabase as getDbConnection, DatabaseInstance } from '../utils/database'

// Database name constant
const DB_NAME = 'zura_memory'

let initialized = false

/**
 * Get memory database with schema initialization
 */
function getMemoryDatabase(): DatabaseInstance {
    const db = getDbConnection(DB_NAME)
    
    if (!initialized) {
        // Create tables
        db.exec(`
            CREATE TABLE IF NOT EXISTS memories (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                content TEXT NOT NULL,
                embedding BLOB,
                metadata TEXT,
                timestamp INTEGER NOT NULL
            );
            
            CREATE TABLE IF NOT EXISTS preferences (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );
            
            CREATE TABLE IF NOT EXISTS task_sequences (
                id TEXT PRIMARY KEY,
                goal TEXT NOT NULL,
                steps TEXT NOT NULL,
                success INTEGER NOT NULL,
                timestamp INTEGER NOT NULL
            );
            
            CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
            CREATE INDEX IF NOT EXISTS idx_memories_timestamp ON memories(timestamp);
        `)
        initialized = true
    }
    return db
}

/**
 * Store a memory
 */
export async function executeStoreMemory(args: { type: 'short' | 'medium' | 'long'; content: string; metadata?: Record<string, any> }): Promise<ToolResult> {
    try {
        const { type, content, metadata } = args
        
        if (typeof type !== 'string' || typeof content !== 'string') {
            return { success: false, error: 'type and content must be strings' }
        }
        
        if (!['short', 'medium', 'long'].includes(type)) {
            return { success: false, error: 'type must be "short", "medium", or "long"' }
        }
        
        const db = getMemoryDatabase()
        const id = `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        
        db.prepare(`
            INSERT INTO memories (id, type, content, metadata, timestamp)
            VALUES (?, ?, ?, ?, ?)
        `).run(id, type, content, JSON.stringify(metadata || {}), Date.now())
        
        return {
            success: true,
            data: {
                id,
                type,
                message: `Stored ${type}-term memory`
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to store memory' }
    }
}

/**
 * Search memories
 */
export async function executeSearchMemories(args: { query: string; type?: 'short' | 'medium' | 'long'; limit?: number }): Promise<ToolResult> {
    try {
        const { query, type, limit = 10 } = args
        
        if (typeof query !== 'string') {
            return { success: false, error: 'query must be a string' }
        }
        
        const db = getMemoryDatabase()
        let sql = 'SELECT * FROM memories WHERE content LIKE ?'
        const params: any[] = [`%${query}%`]
        
        if (type) {
            sql += ' AND type = ?'
            params.push(type)
        }
        
        sql += ' ORDER BY timestamp DESC LIMIT ?'
        params.push(limit)
        
        const memories = db.prepare(sql).all(...params) as Array<{
            id: string
            type: string
            content: string
            metadata: string
            timestamp: number
        }>
        
        return {
            success: true,
            data: {
                memories: memories.map(m => ({
                    id: m.id,
                    type: m.type,
                    content: m.content,
                    metadata: JSON.parse(m.metadata || '{}'),
                    timestamp: m.timestamp
                })),
                count: memories.length,
                message: `Found ${memories.length} memories`
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to search memories' }
    }
}

/**
 * Store user preference
 */
export async function executeStorePreference(args: { key: string; value: string }): Promise<ToolResult> {
    try {
        const { key, value } = args
        
        if (typeof key !== 'string' || typeof value !== 'string') {
            return { success: false, error: 'key and value must be strings' }
        }
        
        const db = getMemoryDatabase()
        
        db.prepare(`
            INSERT OR REPLACE INTO preferences (key, value, updated_at)
            VALUES (?, ?, ?)
        `).run(key, value, Date.now())
        
        return {
            success: true,
            data: {
                key,
                message: `Stored preference: ${key}`
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to store preference' }
    }
}

/**
 * Get user preference
 */
export async function executeGetPreference(args: { key: string }): Promise<ToolResult> {
    try {
        const { key } = args
        
        if (typeof key !== 'string') {
            return { success: false, error: 'key must be a string' }
        }
        
        const db = getMemoryDatabase()
        const pref = db.prepare('SELECT * FROM preferences WHERE key = ?').get(key) as { key: string; value: string; updated_at: number } | undefined
        
        if (!pref) {
            return {
                success: true,
                data: {
                    key,
                    value: null,
                    exists: false,
                    message: `Preference not found: ${key}`
                }
            }
        }
        
        return {
            success: true,
            data: {
                key: pref.key,
                value: pref.value,
                exists: true,
                updatedAt: pref.updated_at,
                message: `Preference: ${key} = ${pref.value}`
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to get preference' }
    }
}

/**
 * Store successful task sequence
 */
export async function executeStoreTaskSequence(args: { goal: string; steps: Array<{ description: string; tool?: string; args?: Record<string, any> }> }): Promise<ToolResult> {
    try {
        const { goal, steps } = args
        
        if (typeof goal !== 'string' || !Array.isArray(steps)) {
            return { success: false, error: 'goal must be a string and steps must be an array' }
        }
        
        const db = getMemoryDatabase()
        const id = `seq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        
        db.prepare(`
            INSERT INTO task_sequences (id, goal, steps, success, timestamp)
            VALUES (?, ?, ?, ?, ?)
        `).run(id, goal, JSON.stringify(steps), 1, Date.now())
        
        return {
            success: true,
            data: {
                id,
                goal,
                stepCount: steps.length,
                message: `Stored task sequence: ${goal}`
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to store task sequence' }
    }
}

/**
 * Find similar task sequences
 */
export async function executeFindSimilarTasks(args: { goal: string; limit?: number }): Promise<ToolResult> {
    try {
        const { goal, limit = 5 } = args
        
        if (typeof goal !== 'string') {
            return { success: false, error: 'goal must be a string' }
        }
        
        const db = getMemoryDatabase()
        const sequences = db.prepare(`
            SELECT * FROM task_sequences 
            WHERE goal LIKE ? 
            ORDER BY timestamp DESC 
            LIMIT ?
        `).all(`%${goal}%`, limit) as Array<{
            id: string
            goal: string
            steps: string
            success: number
            timestamp: number
        }>
        
        return {
            success: true,
            data: {
                sequences: sequences.map(s => ({
                    id: s.id,
                    goal: s.goal,
                    steps: JSON.parse(s.steps),
                    success: s.success === 1,
                    timestamp: s.timestamp
                })),
                count: sequences.length,
                message: `Found ${sequences.length} similar task sequences`
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to find similar tasks' }
    }
}


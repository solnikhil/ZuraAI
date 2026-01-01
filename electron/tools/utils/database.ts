// Database Utility - Shared database initialization
// Consolidates duplicated database initialization code across tools

import * as path from 'path'
import { app } from 'electron'

// Use require for better-sqlite3 due to ESM compatibility issues
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Database = require('better-sqlite3')

// Type for better-sqlite3 database instance
export type DatabaseInstance = ReturnType<typeof Database>

// Cache for database connections
const dbConnections: Map<string, DatabaseInstance> = new Map()

/**
 * Get or create a database connection with caching
 * @param dbName - Name of the database file (without .db extension)
 * @returns Database instance
 */
export function getDatabase(dbName: string): DatabaseInstance {
    if (dbConnections.has(dbName)) {
        return dbConnections.get(dbName)!
    }
    
    const dbPath = path.join(app.getPath('userData'), `${dbName}.db`)
    const db = new Database(dbPath)
    dbConnections.set(dbName, db)
    return db
}

/**
 * Close all database connections
 * Should be called during app shutdown
 */
export function closeAllDatabases(): void {
    for (const [name, db] of dbConnections) {
        try {
            db.close()
            console.log(`Closed database: ${name}`)
        } catch (e) {
            console.error(`Failed to close database ${name}:`, e)
        }
    }
    dbConnections.clear()
}

/**
 * Close a specific database connection
 * @param dbName - Name of the database to close
 */
export function closeDatabase(dbName: string): void {
    const db = dbConnections.get(dbName)
    if (db) {
        try {
            db.close()
            console.log(`Closed database: ${dbName}`)
        } catch (e) {
            console.error(`Failed to close database ${dbName}:`, e)
        }
        dbConnections.delete(dbName)
    }
}

/**
 * Check if a database connection exists
 * @param dbName - Name of the database to check
 * @returns true if connection exists
 */
export function hasDatabase(dbName: string): boolean {
    return dbConnections.has(dbName)
}

/**
 * Get all active database names
 * @returns Array of database names
 */
export function getActiveDatabaseNames(): string[] {
    return Array.from(dbConnections.keys())
}

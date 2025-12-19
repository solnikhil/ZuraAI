// File System Operations
// Phase 2.2: Application & System Control

import * as fs from 'fs/promises'
import * as path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { ToolResult } from '../types'

const execAsync = promisify(exec)

/**
 * Read file contents
 */
export async function executeReadFile(args: { path: string }): Promise<ToolResult> {
    try {
        const { path: filePath } = args
        
        if (typeof filePath !== 'string') {
            return { success: false, error: 'path must be a string' }
        }
        
        // Security check: prevent reading system files
        const normalizedPath = path.normalize(filePath)
        if (normalizedPath.includes('..')) {
            return { success: false, error: 'Invalid path: cannot use ..' }
        }
        
        const content = await fs.readFile(filePath, 'utf-8')
        
        return {
            success: true,
            data: { 
                path: filePath,
                content,
                size: content.length,
                message: `Read file: ${filePath}` 
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to read file' }
    }
}

/**
 * Write content to file
 */
export async function executeWriteFile(args: { path: string; content: string }): Promise<ToolResult> {
    try {
        const { path: filePath, content } = args
        
        if (typeof filePath !== 'string' || typeof content !== 'string') {
            return { success: false, error: 'path and content must be strings' }
        }
        
        const normalizedPath = path.normalize(filePath)
        if (normalizedPath.includes('..')) {
            return { success: false, error: 'Invalid path: cannot use ..' }
        }
        
        await fs.writeFile(filePath, content, 'utf-8')
        
        return {
            success: true,
            data: { 
                path: filePath,
                size: content.length,
                message: `Wrote file: ${filePath}` 
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to write file' }
    }
}

/**
 * Create a new file
 */
export async function executeCreateFile(args: { path: string }): Promise<ToolResult> {
    try {
        const { path: filePath } = args
        
        if (typeof filePath !== 'string') {
            return { success: false, error: 'path must be a string' }
        }
        
        const normalizedPath = path.normalize(filePath)
        if (normalizedPath.includes('..')) {
            return { success: false, error: 'Invalid path: cannot use ..' }
        }
        
        // Create directory if it doesn't exist
        const dir = path.dirname(filePath)
        await fs.mkdir(dir, { recursive: true })
        
        // Create empty file
        await fs.writeFile(filePath, '', 'utf-8')
        
        return {
            success: true,
            data: { 
                path: filePath,
                message: `Created file: ${filePath}` 
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to create file' }
    }
}

/**
 * Delete a file
 */
export async function executeDeleteFile(args: { path: string }): Promise<ToolResult> {
    try {
        const { path: filePath } = args
        
        if (typeof filePath !== 'string') {
            return { success: false, error: 'path must be a string' }
        }
        
        const normalizedPath = path.normalize(filePath)
        if (normalizedPath.includes('..')) {
            return { success: false, error: 'Invalid path: cannot use ..' }
        }
        
        await fs.unlink(filePath)
        
        return {
            success: true,
            data: { 
                path: filePath,
                message: `Deleted file: ${filePath}` 
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to delete file' }
    }
}

/**
 * List directory contents
 */
export async function executeListDirectory(args: { path: string }): Promise<ToolResult> {
    try {
        const { path: dirPath } = args
        
        if (typeof dirPath !== 'string') {
            return { success: false, error: 'path must be a string' }
        }
        
        const normalizedPath = path.normalize(dirPath)
        if (normalizedPath.includes('..')) {
            return { success: false, error: 'Invalid path: cannot use ..' }
        }
        
        const entries = await fs.readdir(dirPath, { withFileTypes: true })
        
        const files = entries
            .filter(entry => entry.isFile())
            .map(entry => ({
                name: entry.name,
                type: 'file',
                path: path.join(dirPath, entry.name)
            }))
        
        const directories = entries
            .filter(entry => entry.isDirectory())
            .map(entry => ({
                name: entry.name,
                type: 'directory',
                path: path.join(dirPath, entry.name)
            }))
        
        return {
            success: true,
            data: { 
                path: dirPath,
                files,
                directories,
                total: entries.length,
                message: `Listed directory: ${dirPath}` 
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to list directory' }
    }
}

/**
 * Create a directory
 */
export async function executeCreateDirectory(args: { path: string }): Promise<ToolResult> {
    try {
        const { path: dirPath } = args
        
        if (typeof dirPath !== 'string') {
            return { success: false, error: 'path must be a string' }
        }
        
        const normalizedPath = path.normalize(dirPath)
        if (normalizedPath.includes('..')) {
            return { success: false, error: 'Invalid path: cannot use ..' }
        }
        
        await fs.mkdir(dirPath, { recursive: true })
        
        return {
            success: true,
            data: { 
                path: dirPath,
                message: `Created directory: ${dirPath}` 
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to create directory' }
    }
}

/**
 * Copy a file
 */
export async function executeCopyFile(args: { src: string; dest: string }): Promise<ToolResult> {
    try {
        const { src, dest } = args
        
        if (typeof src !== 'string' || typeof dest !== 'string') {
            return { success: false, error: 'src and dest must be strings' }
        }
        
        const normalizedSrc = path.normalize(src)
        const normalizedDest = path.normalize(dest)
        
        if (normalizedSrc.includes('..') || normalizedDest.includes('..')) {
            return { success: false, error: 'Invalid path: cannot use ..' }
        }
        
        await fs.copyFile(src, dest)
        
        return {
            success: true,
            data: { 
                src,
                dest,
                message: `Copied file from ${src} to ${dest}` 
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to copy file' }
    }
}

/**
 * Move/rename a file
 */
export async function executeMoveFile(args: { src: string; dest: string }): Promise<ToolResult> {
    try {
        const { src, dest } = args
        
        if (typeof src !== 'string' || typeof dest !== 'string') {
            return { success: false, error: 'src and dest must be strings' }
        }
        
        const normalizedSrc = path.normalize(src)
        const normalizedDest = path.normalize(dest)
        
        if (normalizedSrc.includes('..') || normalizedDest.includes('..')) {
            return { success: false, error: 'Invalid path: cannot use ..' }
        }
        
        await fs.rename(src, dest)
        
        return {
            success: true,
            data: { 
                src,
                dest,
                message: `Moved file from ${src} to ${dest}` 
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to move file' }
    }
}

/**
 * Check if file exists
 */
export async function executeFileExists(args: { path: string }): Promise<ToolResult> {
    try {
        const { path: filePath } = args
        
        if (typeof filePath !== 'string') {
            return { success: false, error: 'path must be a string' }
        }
        
        const normalizedPath = path.normalize(filePath)
        if (normalizedPath.includes('..')) {
            return { success: false, error: 'Invalid path: cannot use ..' }
        }
        
        try {
            await fs.access(filePath)
            const stats = await fs.stat(filePath)
            
            return {
                success: true,
                data: { 
                    path: filePath,
                    exists: true,
                    isFile: stats.isFile(),
                    isDirectory: stats.isDirectory(),
                    size: stats.size,
                    message: `File exists: ${filePath}` 
                }
            }
        } catch {
            return {
                success: true,
                data: { 
                    path: filePath,
                    exists: false,
                    message: `File does not exist: ${filePath}` 
                }
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to check file existence' }
    }
}

/**
 * Get file information
 */
export async function executeGetFileInfo(args: { path: string }): Promise<ToolResult> {
    try {
        const { path: filePath } = args
        
        if (typeof filePath !== 'string') {
            return { success: false, error: 'path must be a string' }
        }
        
        const normalizedPath = path.normalize(filePath)
        if (normalizedPath.includes('..')) {
            return { success: false, error: 'Invalid path: cannot use ..' }
        }
        
        const stats = await fs.stat(filePath)
        
        return {
            success: true,
            data: { 
                path: filePath,
                name: path.basename(filePath),
                size: stats.size,
                isFile: stats.isFile(),
                isDirectory: stats.isDirectory(),
                created: stats.birthtime.toISOString(),
                modified: stats.mtime.toISOString(),
                accessed: stats.atime.toISOString(),
                message: `File info: ${filePath}` 
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to get file info' }
    }
}

/**
 * Open file with default application
 */
export async function executeOpenFile(args: { path: string }): Promise<ToolResult> {
    try {
        const { path: filePath } = args
        
        if (typeof filePath !== 'string') {
            return { success: false, error: 'path must be a string' }
        }
        
        const normalizedPath = path.normalize(filePath)
        if (normalizedPath.includes('..')) {
            return { success: false, error: 'Invalid path: cannot use ..' }
        }
        
        // On Windows, use 'start' command
        await execAsync(`start "" "${filePath}"`)
        
        return {
            success: true,
            data: { 
                path: filePath,
                message: `Opened file: ${filePath}` 
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to open file' }
    }
}

/**
 * Open folder in Explorer
 */
export async function executeOpenFolder(args: { path: string }): Promise<ToolResult> {
    try {
        const { path: dirPath } = args
        
        if (typeof dirPath !== 'string') {
            return { success: false, error: 'path must be a string' }
        }
        
        const normalizedPath = path.normalize(dirPath)
        if (normalizedPath.includes('..')) {
            return { success: false, error: 'Invalid path: cannot use ..' }
        }
        
        // On Windows, use 'explorer' command
        await execAsync(`explorer "${dirPath}"`)
        
        return {
            success: true,
            data: { 
                path: dirPath,
                message: `Opened folder: ${dirPath}` 
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to open folder' }
    }
}


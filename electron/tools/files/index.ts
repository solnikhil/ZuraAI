import fs from 'fs/promises'
import path from 'path'

import type { ToolResult } from '../types'
import { isRecord, requireApproval, stringArg, truncateOutput } from '../native-common'

const MAX_FILE_READ_BYTES = 512_000
const MAX_FILE_WRITE_BYTES = 1_000_000
const MAX_SEARCH_RESULTS = 100

function resolvePath(raw: string): string {
  if (!raw) throw new Error('path is required.')
  return path.resolve(raw)
}

export async function executeFileRead(args: unknown): Promise<ToolResult> {
  try {
    const filePath = resolvePath(stringArg(args, 'path'))
    const stat = await fs.stat(filePath)
    if (!stat.isFile()) return { success: false, error: 'path must point to a file.' }
    if (stat.size > MAX_FILE_READ_BYTES) {
      return {
        success: false,
        error: `File is too large to read (${stat.size} bytes, max ${MAX_FILE_READ_BYTES}).`,
      }
    }
    const content = await fs.readFile(filePath, 'utf8')
    return { success: true, data: { path: filePath, content, size: stat.size } }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'file_read failed.' }
  }
}

export async function executeFileWrite(args: unknown): Promise<ToolResult> {
  const approval = requireApproval(args, 'file_write')
  if (approval) return approval
  try {
    const filePath = resolvePath(stringArg(args, 'path'))
    const content = isRecord(args) && typeof args.content === 'string' ? args.content : ''
    if (Buffer.byteLength(content, 'utf8') > MAX_FILE_WRITE_BYTES) {
      return { success: false, error: `content exceeds ${MAX_FILE_WRITE_BYTES} bytes.` }
    }
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content, 'utf8')
    return {
      success: true,
      data: { path: filePath, bytesWritten: Buffer.byteLength(content, 'utf8') },
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'file_write failed.' }
  }
}

async function walkSearch(
  root: string,
  query: string,
  results: Array<{ path: string; type: string }>
): Promise<void> {
  if (results.length >= MAX_SEARCH_RESULTS) return
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (results.length >= MAX_SEARCH_RESULTS) return
    const full = path.join(root, entry.name)
    if (entry.name.toLowerCase().includes(query)) {
      results.push({ path: full, type: entry.isDirectory() ? 'directory' : 'file' })
    }
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      await walkSearch(full, query, results)
    }
  }
}

export async function executeFileSearch(args: unknown): Promise<ToolResult> {
  try {
    const query = stringArg(args, 'query').toLowerCase()
    if (!query) return { success: false, error: 'query is required.' }
    const root = resolvePath(stringArg(args, 'root') || process.cwd())
    const results: Array<{ path: string; type: string }> = []
    await walkSearch(root, query, results)
    return { success: true, data: { root, query, results } }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'file_search failed.' }
  }
}

export async function executeFileMove(args: unknown): Promise<ToolResult> {
  const approval = requireApproval(args, 'file_move')
  if (approval) return approval
  try {
    const source = resolvePath(stringArg(args, 'source'))
    const destination = resolvePath(stringArg(args, 'destination'))
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.rename(source, destination)
    return { success: true, data: { source, destination } }
  } catch (error) {
    return {
      success: false,
      error: truncateOutput(error instanceof Error ? error.message : 'file_move failed.'),
    }
  }
}

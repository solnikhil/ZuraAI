import { execFile } from 'child_process'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { shell } from 'electron'

import type { ToolResult } from '../types'
import {
  isWindows,
  requireApproval,
  runPowerShell,
  stringArg,
  truncateOutput,
  unsupportedWindowsOnly,
} from '../native-common'

interface AppMatch {
  name: string
  path: string
  source: 'start-menu'
}

function startMenuRoots(): string[] {
  return [
    path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs',
  ]
}

async function scanApps(root: string, results: AppMatch[], query = ''): Promise<void> {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) {
      await scanApps(full, results, query)
      continue
    }
    if (path.extname(entry.name).toLowerCase() !== '.lnk') continue
    const name = path.basename(entry.name, '.lnk')
    if (!query || name.toLowerCase().includes(query.toLowerCase())) {
      results.push({ name, path: full, source: 'start-menu' })
    }
  }
}

function runWinget(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile('winget.exe', args, { windowsHide: true, timeout: 60_000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr?.trim() || error.message))
        return
      }
      resolve({ stdout: truncateOutput(stdout ?? ''), stderr: truncateOutput(stderr ?? '') })
    })
  })
}

export async function executeAppFind(args: unknown): Promise<ToolResult> {
  if (!isWindows()) return unsupportedWindowsOnly('app_find')
  const query = stringArg(args, 'query')
  if (!query) return { success: false, error: 'query is required.' }
  const matches: AppMatch[] = []
  for (const root of startMenuRoots()) {
    await scanApps(root, matches, query)
  }
  return { success: true, data: { query, matches: matches.slice(0, 20) } }
}

export async function executeAppList(): Promise<ToolResult> {
  if (!isWindows()) return unsupportedWindowsOnly('app_list')
  const apps: AppMatch[] = []
  for (const root of startMenuRoots()) {
    await scanApps(root, apps)
  }
  return { success: true, data: { apps: apps.slice(0, 300), count: apps.length } }
}

export async function executeAppLaunch(args: unknown): Promise<ToolResult> {
  if (!isWindows()) return unsupportedWindowsOnly('app_launch')
  const approval = requireApproval(args, 'app_launch')
  if (approval) return approval
  const nameOrPath = stringArg(args, 'nameOrPath')
  if (!nameOrPath) return { success: false, error: 'nameOrPath is required.' }
  try {
    if (nameOrPath.includes('\\') || nameOrPath.includes('/') || nameOrPath.endsWith('.lnk')) {
      const error = await shell.openPath(nameOrPath)
      if (error) return { success: false, error }
    } else {
      await runPowerShell(`Start-Process -FilePath ${JSON.stringify(nameOrPath)}`)
    }
    return { success: true, data: { launched: nameOrPath } }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'app_launch failed.' }
  }
}

export async function executeAppInstall(args: unknown): Promise<ToolResult> {
  if (!isWindows()) return unsupportedWindowsOnly('app_install')
  const approval = requireApproval(args, 'app_install')
  if (approval) return approval
  const packageId = stringArg(args, 'packageId')
  if (!packageId) return { success: false, error: 'packageId is required.' }
  try {
    const result = await runWinget(['install', '--id', packageId, '--silent', '--accept-package-agreements', '--accept-source-agreements'])
    return { success: true, data: { packageId, ...result } }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'app_install failed.' }
  }
}

export async function executeAppUninstall(args: unknown): Promise<ToolResult> {
  if (!isWindows()) return unsupportedWindowsOnly('app_uninstall')
  const approval = requireApproval(args, 'app_uninstall')
  if (approval) return approval
  const packageId = stringArg(args, 'packageId')
  if (!packageId) return { success: false, error: 'packageId is required.' }
  try {
    const result = await runWinget(['uninstall', '--id', packageId, '--silent', '--accept-source-agreements'])
    return { success: true, data: { packageId, ...result } }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'app_uninstall failed.' }
  }
}

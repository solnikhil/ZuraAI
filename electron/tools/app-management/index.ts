import { shell } from 'electron'

import {
  findApps,
  listApps,
  recordAppLaunch,
  refreshAppIndex,
  warmAppIndex,
} from '../../appIndexService'
import type { ToolResult } from '../types'
import {
  isWindows,
  requireApproval,
  runPowerShell,
  stringArg,
  truncateOutput,
  unsupportedWindowsOnly,
} from '../native-common'
import { execFile } from 'child_process'

export { refreshAppIndex, warmAppIndex }

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
  try {
    const result = await findApps(query)
    return {
      success: true,
      data: {
        query,
        matches: result.matches,
        diagnostics: result.diagnostics,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Native Windows app search failed.',
    }
  }
}

export async function executeAppList(): Promise<ToolResult> {
  if (!isWindows()) return unsupportedWindowsOnly('app_list')
  try {
    const result = await listApps()
    return {
      success: true,
      data: {
        apps: result.apps,
        count: result.count,
        diagnostics: result.diagnostics,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Native Windows app search failed.',
    }
  }
}

export async function executeAppLaunch(args: unknown): Promise<ToolResult> {
  if (!isWindows()) return unsupportedWindowsOnly('app_launch')
  const approval = requireApproval(args, 'app_launch')
  if (approval) return approval
  const nameOrPath = stringArg(args, 'nameOrPath')
  const appUserModelId = stringArg(args, 'appUserModelId')
  const itemId = stringArg(args, 'itemId')
  if (!nameOrPath && !appUserModelId) return { success: false, error: 'nameOrPath or appUserModelId is required.' }
  try {
    if (appUserModelId) {
      await runPowerShell(`Start-Process ${JSON.stringify(`shell:AppsFolder\\${appUserModelId}`)}`)
    } else if (nameOrPath.includes('\\') || nameOrPath.includes('/') || nameOrPath.endsWith('.lnk')) {
      const error = await shell.openPath(nameOrPath)
      if (error) {
        refreshAppIndex().catch(() => undefined)
        return { success: false, error }
      }
    } else {
      await runPowerShell(`Start-Process -FilePath ${JSON.stringify(nameOrPath)}`)
    }
    if (itemId) {
      await recordAppLaunch(itemId)
    }
    return { success: true, data: { launched: nameOrPath || appUserModelId } }
  } catch (error) {
    refreshAppIndex().catch(() => undefined)
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
    refreshAppIndex().catch(() => undefined)
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
    refreshAppIndex().catch(() => undefined)
    return { success: true, data: { packageId, ...result } }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'app_uninstall failed.' }
  }
}

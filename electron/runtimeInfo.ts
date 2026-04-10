import { app } from 'electron'
import os from 'os'

import type { AppRuntimeInfo } from '../src/electron'

function getPlatformLabel(platform: NodeJS.Platform, version?: string): string {
  if (platform === 'win32') {
    const match = version?.match(/(\d+)\.(\d+)\.(\d+)/)
    if (match) {
      const build = parseInt(match[3], 10)
      if (build >= 22000) return 'Windows 11'
    }
    return 'Windows 10'
  }

  switch (platform) {
    case 'darwin':
      return 'macOS'
    case 'linux':
      return 'Linux'
    default:
      return platform
  }
}

export function getAppRuntimeInfo(): AppRuntimeInfo {
  const systemVersion = typeof process.getSystemVersion === 'function'
    ? process.getSystemVersion()
    : os.release()

  return {
    appName: app.getName(),
    appVersion: app.getVersion(),
    channel: app.isPackaged ? 'Installed build' : 'Development build',
    isPackaged: app.isPackaged,
    electronVersion: process.versions.electron ?? 'Unknown',
    chromiumVersion: process.versions.chrome ?? 'Unknown',
    nodeVersion: process.versions.node ?? 'Unknown',
    v8Version: process.versions.v8 ?? 'Unknown',
    osVersion: `${getPlatformLabel(process.platform, systemVersion)} ${systemVersion} (${os.arch()})`,
    commitHash: process.env.VITE_GIT_COMMIT_HASH || 'unknown',
    commitDate: process.env.VITE_GIT_COMMIT_DATE || 'unknown',
  }
}

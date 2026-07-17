import { spawn, type ChildProcess } from 'node:child_process'
import { BrowserWindow } from 'electron'

import { KILL_SWITCH_WINDOW_MS } from './constants'
import { hideSpotlight } from '../../windows/spotlightOverlay'

let killWatcher: ChildProcess | null = null
let onKillCallback: (() => void) | null = null

const ESCAPE_WATCHER_SCRIPT = String.raw`
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class ZuraEscapeWatcher {
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int key);
}
"@
$lastDown = $false
$lastTap = [int64]0
while ($true) {
  $down = (([ZuraEscapeWatcher]::GetAsyncKeyState(0x1B) -band 0x8000) -ne 0)
  if ($down -and -not $lastDown) {
    $now = [Environment]::TickCount64
    if ($lastTap -gt 0 -and ($now - $lastTap) -lt ${KILL_SWITCH_WINDOW_MS}) {
      [Console]::Out.WriteLine('kill')
      [Console]::Out.Flush()
      break
    }
    $lastTap = $now
  }
  $lastDown = $down
  Start-Sleep -Milliseconds 30
}
`

function broadcastKilled(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('computer-use:killed')
  }
}

function handleKill(): void {
  const callback = onKillCallback
  unregisterKillSwitch()
  callback?.()
  hideSpotlight()
  broadcastKilled()
}

/** Observe Esc+Esc without registering/swallowing the user's global Escape key. */
export function registerKillSwitch(onKill?: () => void): void {
  if (onKill) onKillCallback = onKill
  if (killWatcher || process.platform !== 'win32') return

  try {
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        ESCAPE_WATCHER_SCRIPT,
      ],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
    )
    killWatcher = child
    let output = ''
    child.stdout?.on('data', (chunk: Buffer | string) => {
      output += String(chunk)
      if (output.includes('kill')) handleKill()
      else if (output.length > 32) output = output.slice(-32)
    })
    child.once('exit', () => {
      if (killWatcher === child) killWatcher = null
    })
    child.once('error', () => {
      if (killWatcher === child) killWatcher = null
    })
  } catch {
    killWatcher = null
  }
}

export function unregisterKillSwitch(): void {
  const child = killWatcher
  killWatcher = null
  onKillCallback = null
  if (child && !child.killed) child.kill()
}

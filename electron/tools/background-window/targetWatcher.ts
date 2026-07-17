import { screen } from 'electron'
import { parseJsonOutput, runPowerShell } from '../native-common'
import {
  isValidNativeWindowHandle,
  sameTarget,
  type BackgroundWindowSnapshot,
  type BackgroundWindowTarget,
} from './types'

export interface TargetWindowSnapshotProvider {
  read(hwnd: number): Promise<BackgroundWindowSnapshot | null>
}

interface RawWindowSnapshot {
  hwnd: number
  processId: number
  processStartTimeMs: number
  title: string
  x: number
  y: number
  width: number
  height: number
  visible: boolean
  minimized: boolean
}

const SNAPSHOT_SCRIPT = String.raw`
param([long]$TargetHwnd)
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class ZuraGuardWindowNative {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int max);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hwnd, int attr, out RECT rect, int size);
}
"@
$hwnd = [IntPtr]$TargetHwnd
if (-not [ZuraGuardWindowNative]::IsWindow($hwnd)) { return }
$pidValue = [uint32]0
[void][ZuraGuardWindowNative]::GetWindowThreadProcessId($hwnd, [ref]$pidValue)
if ($pidValue -eq 0) { return }
$owner = Get-Process -Id $pidValue -ErrorAction Stop
$rect = New-Object ZuraGuardWindowNative+RECT
$dwmResult = [ZuraGuardWindowNative]::DwmGetWindowAttribute($hwnd, 9, [ref]$rect, [Runtime.InteropServices.Marshal]::SizeOf($rect))
if ($dwmResult -ne 0 -and -not [ZuraGuardWindowNative]::GetWindowRect($hwnd, [ref]$rect)) { return }
$title = New-Object Text.StringBuilder 1024
[void][ZuraGuardWindowNative]::GetWindowText($hwnd, $title, $title.Capacity)
[pscustomobject]@{
  hwnd = [int64]$TargetHwnd
  processId = [int]$pidValue
  processStartTimeMs = [int64]([DateTimeOffset]$owner.StartTime.ToUniversalTime()).ToUnixTimeMilliseconds()
  title = $title.ToString()
  x = $rect.Left
  y = $rect.Top
  width = [Math]::Max(0, $rect.Right - $rect.Left)
  height = [Math]::Max(0, $rect.Bottom - $rect.Top)
  visible = [ZuraGuardWindowNative]::IsWindowVisible($hwnd)
  minimized = [ZuraGuardWindowNative]::IsIconic($hwnd)
} | ConvertTo-Json -Compress
`

export class PowerShellTargetWindowSnapshotProvider implements TargetWindowSnapshotProvider {
  async read(hwnd: number): Promise<BackgroundWindowSnapshot | null> {
    if (process.platform !== 'win32' || !isValidNativeWindowHandle(hwnd)) return null
    try {
      const { stdout } = await runPowerShell(
        `& { ${SNAPSHOT_SCRIPT} } -TargetHwnd ${Math.trunc(hwnd)}`,
        { timeoutMs: 5_000, maxOutputLength: 8_000 }
      )
      if (!stdout.trim()) return null
      const raw = parseJsonOutput<RawWindowSnapshot>(stdout)
      if (!isRawSnapshot(raw, hwnd)) return null
      const bounds = screen.screenToDipRect(null, {
        x: raw.x,
        y: raw.y,
        width: raw.width,
        height: raw.height,
      })
      return {
        hwnd: raw.hwnd,
        processId: raw.processId,
        processStartTimeMs: raw.processStartTimeMs,
        title: raw.title.slice(0, 512),
        bounds,
        visible: raw.visible,
        minimized: raw.minimized,
      }
    } catch {
      return null
    }
  }
}

export interface TargetWindowWatcherOptions {
  intervalMs?: number
  provider?: TargetWindowSnapshotProvider
}

export class TargetWindowWatcher {
  private readonly intervalMs: number
  private readonly provider: TargetWindowSnapshotProvider
  private timer: ReturnType<typeof setTimeout> | null = null
  private generation = 0

  constructor(options: TargetWindowWatcherOptions = {}) {
    this.intervalMs = Math.max(200, options.intervalMs ?? 500)
    this.provider = options.provider ?? new PowerShellTargetWindowSnapshotProvider()
  }

  start(
    target: BackgroundWindowTarget,
    onSnapshot: (snapshot: BackgroundWindowSnapshot) => void,
    onLost: () => void,
    initialSnapshot?: BackgroundWindowSnapshot
  ): void {
    this.stop()
    const generation = this.generation
    if (initialSnapshot) onSnapshot(initialSnapshot)

    const poll = async (): Promise<void> => {
      const snapshot = await this.provider.read(target.hwnd)
      if (generation !== this.generation) return
      if (!snapshot || !sameTarget(target, snapshot)) {
        this.stop()
        onLost()
        return
      }
      onSnapshot(snapshot)
      this.timer = setTimeout(() => void poll(), this.intervalMs)
    }

    this.timer = setTimeout(() => void poll(), this.intervalMs)
  }

  stop(): void {
    this.generation += 1
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }
}

function isRawSnapshot(value: RawWindowSnapshot, expectedHwnd: number): boolean {
  return (
    value &&
    value.hwnd === expectedHwnd &&
    Number.isSafeInteger(value.processId) &&
    value.processId > 0 &&
    Number.isSafeInteger(value.processStartTimeMs) &&
    value.processStartTimeMs > 0 &&
    typeof value.title === 'string' &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.width) &&
    Number.isFinite(value.height) &&
    value.width > 0 &&
    value.height > 0 &&
    typeof value.visible === 'boolean' &&
    typeof value.minimized === 'boolean'
  )
}

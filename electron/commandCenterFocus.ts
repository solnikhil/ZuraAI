/**
 * Capture/restore the OS foreground window so Command Center can return focus
 * before clipboard paste (emoji, etc.). Capture must run *before* the overlay
 * takes focus. Freeform HWNDs from the renderer are never accepted.
 */
import { execFile, execFileSync } from 'node:child_process'

let returnTargetHwnd: number | null = null

function isWindows(): boolean {
  return process.platform === 'win32'
}

/**
 * Snapshot the current foreground window (sync, before overlay show/focus).
 * Skips our own Command Center / Electron chrome when already focused.
 */
export function captureCommandCenterReturnTarget(): number | null {
  if (!isWindows()) {
    returnTargetHwnd = null
    return null
  }
  try {
    const out = execFileSync(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class ZuraFg {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@
$hwnd = [ZuraFg]::GetForegroundWindow()
if ($hwnd -eq [IntPtr]::Zero) { Write-Output "0"; exit 0 }
$pidValue = 0
[ZuraFg]::GetWindowThreadProcessId($hwnd, [ref]$pidValue) | Out-Null
$process = if ($pidValue -gt 0) { Get-Process -Id $pidValue -ErrorAction SilentlyContinue } else { $null }
$name = if ($null -ne $process) { [string]$process.ProcessName } else { "" }
$builder = New-Object System.Text.StringBuilder 256
[ZuraFg]::GetWindowText($hwnd, $builder, $builder.Capacity) | Out-Null
$title = [string]$builder.ToString()
# Do not treat our own overlay/main as the paste return target.
if ($name -match '^(ZuraAI|zuraai)$') { Write-Output "0"; exit 0 }
if ($name -eq 'electron' -and $title -like '*Command Center*') { Write-Output "0"; exit 0 }
if ($name -eq 'electron' -and $title -like '*ZuraAI*') {
  # Prefer keeping a prior target if we already have one.
  Write-Output "0"
  exit 0
}
Write-Output ([int64]$hwnd)
`,
      ],
      {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 4_000,
        maxBuffer: 16 * 1024,
      }
    )
    const hwnd = Number(String(out).trim())
    if (Number.isFinite(hwnd) && hwnd > 0) {
      returnTargetHwnd = Math.trunc(hwnd)
      return returnTargetHwnd
    }
  } catch {
    // Best-effort; paste will still try OS default focus restore.
  }
  // Keep last good target if capture fails mid-session (e.g. reopening CC).
  return returnTargetHwnd
}

export function getCommandCenterReturnTarget(): number | null {
  return returnTargetHwnd
}

export function clearCommandCenterReturnTarget(): void {
  returnTargetHwnd = null
}

/**
 * Force the captured app window (and its focused control when possible) back
 * to the foreground so Ctrl+V lands in the original text field.
 */
function runPowerShell(script: string, timeoutMs = 5_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, timeout: timeoutMs, maxBuffer: 16 * 1024 },
      (error, stdout) => {
        if (error) reject(error)
        else resolve(String(stdout ?? ''))
      }
    )
  })
}

const FOCUS_RESTORE_TYPEDEF = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class ZuraFocus {
  [StructLayout(LayoutKind.Sequential)]
  public struct GUITHREADINFO {
    public int cbSize;
    public int flags;
    public IntPtr hwndActive;
    public IntPtr hwndFocus;
    public IntPtr hwndCapture;
    public IntPtr hwndMenuOwner;
    public IntPtr hwndMoveSize;
    public IntPtr hwndCaret;
    public int left, top, right, bottom;
  }
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr SetFocus(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool GetGUIThreadInfo(uint idThread, ref GUITHREADINFO pgui);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@
`

function buildRestoreBody(hwnd: number): string {
  return `
$hwnd = [IntPtr]${hwnd}
if (-not [ZuraFocus]::IsWindow($hwnd)) { Write-Output "missing"; return }
if ([ZuraFocus]::IsIconic($hwnd)) { [ZuraFocus]::ShowWindow($hwnd, 9) | Out-Null }
$fg = [ZuraFocus]::GetForegroundWindow()
$pidA = 0; $tidA = [ZuraFocus]::GetWindowThreadProcessId($fg, [ref]$pidA)
$pidB = 0; $tidB = [ZuraFocus]::GetWindowThreadProcessId($hwnd, [ref]$pidB)
$cur = [ZuraFocus]::GetCurrentThreadId()
[ZuraFocus]::AttachThreadInput($cur, $tidA, $true) | Out-Null
[ZuraFocus]::AttachThreadInput($cur, $tidB, $true) | Out-Null
[ZuraFocus]::BringWindowToTop($hwnd) | Out-Null
[ZuraFocus]::SetForegroundWindow($hwnd) | Out-Null
$info = New-Object ZuraFocus+GUITHREADINFO
$info.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($info)
if ([ZuraFocus]::GetGUIThreadInfo($tidB, [ref]$info)) {
  if ($info.hwndFocus -ne [IntPtr]::Zero -and [ZuraFocus]::IsWindow($info.hwndFocus)) {
    [ZuraFocus]::SetFocus($info.hwndFocus) | Out-Null
  } else {
    [ZuraFocus]::SetFocus($hwnd) | Out-Null
  }
} else {
  [ZuraFocus]::SetFocus($hwnd) | Out-Null
}
[ZuraFocus]::AttachThreadInput($cur, $tidA, $false) | Out-Null
[ZuraFocus]::AttachThreadInput($cur, $tidB, $false) | Out-Null
`
}

export async function restoreCommandCenterReturnTarget(): Promise<boolean> {
  if (!isWindows() || !returnTargetHwnd || returnTargetHwnd <= 0) return false
  const hwnd = returnTargetHwnd
  try {
    const stdout = await runPowerShell(
      `${FOCUS_RESTORE_TYPEDEF}
${buildRestoreBody(hwnd)}
$now = [ZuraFocus]::GetForegroundWindow()
if ($now -eq $hwnd) { Write-Output "ok" } else { Write-Output "partial" }
`
    )
    const status = stdout.trim()
    return status === 'ok' || status === 'partial'
  } catch {
    return false
  }
}

/**
 * One PowerShell hop: restore captured focus + clipboard paste.
 * Faster than separate restore + User32 Ctrl+V spawns.
 */
export async function restoreFocusAndPasteText(text: string): Promise<boolean> {
  if (!isWindows() || !returnTargetHwnd || returnTargetHwnd <= 0 || !text) return false
  const hwnd = returnTargetHwnd
  // Encode as UTF-16 code units so emoji survives the PowerShell -Command layer.
  const codeUnits = Array.from(text)
    .flatMap((ch) => {
      const cp = ch.codePointAt(0) ?? 0
      if (cp > 0xffff) {
        const u = cp - 0x10000
        return [0xd800 + (u >> 10), 0xdc00 + (u & 0x3ff)]
      }
      return [cp]
    })
    .join(',')
  try {
    const stdout = await runPowerShell(
      `${FOCUS_RESTORE_TYPEDEF}
Add-Type -AssemblyName System.Windows.Forms
${buildRestoreBody(hwnd)}
Start-Sleep -Milliseconds 30
$prev = $null
try { $prev = [System.Windows.Forms.Clipboard]::GetText() } catch { $prev = "" }
try {
  $units = [int[]]@(${codeUnits})
  $chars = New-Object System.Collections.Generic.List[char]
  foreach ($u in $units) { [void]$chars.Add([char]$u) }
  $payload = -join $chars
  [System.Windows.Forms.Clipboard]::SetText($payload)
  Start-Sleep -Milliseconds 20
  # Ctrl+V via keybd_event (same virtual keys as performType)
  [ZuraFocus]::keybd_event(0x11, 0, 0, [UIntPtr]::Zero)
  [ZuraFocus]::keybd_event(0x56, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 15
  [ZuraFocus]::keybd_event(0x56, 0, 2, [UIntPtr]::Zero)
  [ZuraFocus]::keybd_event(0x11, 0, 2, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 50
  Write-Output "ok"
} finally {
  try {
    if ($null -ne $prev -and $prev -ne "") {
      [System.Windows.Forms.Clipboard]::SetText([string]$prev)
    } else {
      [System.Windows.Forms.Clipboard]::Clear()
    }
  } catch {}
}
`,
      6_000
    )
    return stdout.trim().includes('ok')
  } catch {
    return false
  }
}

/**
 * Capture/restore the OS foreground window so Command Center can return focus
 * before clipboard paste (emoji, etc.). Capture must run *before* the overlay
 * takes focus. Freeform HWNDs from the renderer are never accepted.
 */
import { execFile } from 'node:child_process'
import path from 'node:path'
import * as koffi from 'koffi'

let returnTargetHwnd: number | null = null
let returnTargetMacBundleId: string | null = null

function isWindows(): boolean {
  return process.platform === 'win32'
}

type NativeFunction = ReturnType<koffi.LibraryHandle['func']>

interface WindowsForegroundApi {
  getForegroundWindow: NativeFunction
  getWindowText: NativeFunction
  getWindowThreadProcessId: NativeFunction
  openProcess: NativeFunction
  queryFullProcessImageName: NativeFunction
  closeHandle: NativeFunction
}

interface MacForegroundApi {
  appKit: koffi.LibraryHandle
  getClass: NativeFunction
  registerSelector: NativeFunction
  sendObject: NativeFunction
  sendString: NativeFunction
}

let windowsForegroundApi: WindowsForegroundApi | null | undefined
let macForegroundApi: MacForegroundApi | null | undefined

function loadWindowsForegroundApi(): WindowsForegroundApi | null {
  if (windowsForegroundApi !== undefined) return windowsForegroundApi
  try {
    const user32 = koffi.load('user32.dll')
    const kernel32 = koffi.load('kernel32.dll')
    windowsForegroundApi = {
      getForegroundWindow: user32.func('void * __stdcall GetForegroundWindow(void)'),
      getWindowText: user32.func(
        'int __stdcall GetWindowTextW(void *hWnd, _Out_ uint16_t *lpString, int nMaxCount)'
      ),
      getWindowThreadProcessId: user32.func(
        'uint32_t __stdcall GetWindowThreadProcessId(void *hWnd, _Out_ uint32_t *lpdwProcessId)'
      ),
      openProcess: kernel32.func(
        'void * __stdcall OpenProcess(uint32_t dwDesiredAccess, int bInheritHandle, uint32_t dwProcessId)'
      ),
      queryFullProcessImageName: kernel32.func(
        'int __stdcall QueryFullProcessImageNameW(void *hProcess, uint32_t dwFlags, _Out_ uint16_t *lpExeName, _Inout_ uint32_t *lpdwSize)'
      ),
      closeHandle: kernel32.func('int __stdcall CloseHandle(void *hObject)'),
    }
  } catch (error) {
    console.error('[CommandCenter] Failed to initialize native Windows focus capture:', error)
    windowsForegroundApi = null
  }
  return windowsForegroundApi
}

function loadMacForegroundApi(): MacForegroundApi | null {
  if (macForegroundApi !== undefined) return macForegroundApi
  try {
    // Loading AppKit registers NSWorkspace with the Objective-C runtime. Calls
    // stay in-process, avoiding an osascript launch on the shortcut hot path.
    const appKit = koffi.load('/System/Library/Frameworks/AppKit.framework/AppKit')
    const objc = koffi.load('/usr/lib/libobjc.A.dylib')
    macForegroundApi = {
      appKit,
      getClass: objc.func('void *objc_getClass(const char *name)'),
      registerSelector: objc.func('void *sel_registerName(const char *name)'),
      sendObject: objc.func('objc_msgSend', 'void *', ['void *', 'void *']),
      sendString: objc.func('objc_msgSend', 'str', ['void *', 'void *']),
    }
  } catch (error) {
    console.error('[CommandCenter] Failed to initialize native macOS focus capture:', error)
    macForegroundApi = null
  }
  return macForegroundApi
}

function windowsProcessName(api: WindowsForegroundApi, processId: number): string {
  const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
  const processHandle = api.openProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, processId)
  if (!processHandle) return ''
  try {
    const buffer = Buffer.alloc(2 * 1024)
    const size: Array<number | null> = [1024]
    if (!api.queryFullProcessImageName(processHandle, 0, buffer, size)) return ''
    const characterCount = typeof size[0] === 'number' ? size[0] : 0
    return path.win32.basename(buffer.toString('utf16le', 0, characterCount * 2))
  } finally {
    api.closeHandle(processHandle)
  }
}

export function shouldIgnoreWindowsForegroundTarget(
  target: { processId: number; processName: string; title: string },
  currentProcessId = process.pid
): boolean {
  if (target.processId === currentProcessId) return true
  const processName = target.processName.toLowerCase().replace(/\.exe$/, '')
  if (processName === 'zuraai') return true
  return processName === 'electron' && /(?:command center|zuraai)/i.test(target.title)
}

function captureWindowsForegroundTarget(): number | null {
  const api = loadWindowsForegroundApi()
  if (!api) return returnTargetHwnd
  try {
    const nativeHwnd = api.getForegroundWindow()
    if (!nativeHwnd) return returnTargetHwnd

    const processIdOut: Array<number | null> = [null]
    if (!api.getWindowThreadProcessId(nativeHwnd, processIdOut)) return returnTargetHwnd
    const processId = processIdOut[0]
    if (typeof processId !== 'number' || processId <= 0) return returnTargetHwnd

    const titleBuffer = Buffer.alloc(512)
    const titleLength = Number(api.getWindowText(nativeHwnd, titleBuffer, 256)) || 0
    const title = titleBuffer.toString('utf16le', 0, Math.max(0, titleLength) * 2)
    const processName = windowsProcessName(api, processId)
    if (shouldIgnoreWindowsForegroundTarget({ processId, processName, title })) {
      return returnTargetHwnd
    }

    const hwndAddress = Number(koffi.address(nativeHwnd))
    if (Number.isSafeInteger(hwndAddress) && hwndAddress > 0) {
      returnTargetHwnd = hwndAddress
    }
  } catch (error) {
    console.error('[CommandCenter] Native Windows focus capture failed:', error)
  }
  return returnTargetHwnd
}

function captureMacForegroundTarget(): null {
  const api = loadMacForegroundApi()
  if (!api) return null
  try {
    const workspaceClass = api.getClass('NSWorkspace')
    const sharedWorkspace = api.sendObject(
      workspaceClass,
      api.registerSelector('sharedWorkspace')
    )
    const application = api.sendObject(
      sharedWorkspace,
      api.registerSelector('frontmostApplication')
    )
    const bundleIdObject = api.sendObject(application, api.registerSelector('bundleIdentifier'))
    const bundleId = String(
      api.sendString(bundleIdObject, api.registerSelector('UTF8String')) ?? ''
    ).trim()
    if (bundleId && !bundleId.toLowerCase().includes('zura')) {
      returnTargetMacBundleId = bundleId
    }
  } catch (error) {
    console.error('[CommandCenter] Native macOS focus capture failed:', error)
  }
  return null
}

/** Load platform bindings outside the shortcut hot path. */
export function warmCommandCenterFocusCapture(): void {
  if (isWindows()) loadWindowsForegroundApi()
  else if (process.platform === 'darwin') loadMacForegroundApi()
}

/**
 * Snapshot the current foreground window (sync, before overlay show/focus).
 * Skips our own Command Center / Electron chrome when already focused.
 */
export function captureCommandCenterReturnTarget(): number | null {
  if (process.platform === 'darwin') return captureMacForegroundTarget()
  if (!isWindows()) {
    returnTargetHwnd = null
    return null
  }
  return captureWindowsForegroundTarget()
}

export function getCommandCenterReturnTarget(): number | null {
  return returnTargetHwnd
}

export function clearCommandCenterReturnTarget(): void {
  returnTargetHwnd = null
  returnTargetMacBundleId = null
}

/**
 * Force the captured app window (and its focused control when possible) back
 * to the foreground so Ctrl+V lands in the original text field.
 */
function runPowerShell(script: string, timeoutMs = 5_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        script,
      ],
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
  if (process.platform === 'darwin' && returnTargetMacBundleId) {
    const bundleId = returnTargetMacBundleId
    return new Promise((resolve) => {
      execFile(
        'osascript',
        [
          '-e',
          'on run argv\ntell application id (item 1 of argv) to activate\ndelay 0.08\nend run',
          bundleId,
        ],
        { timeout: 5_000, maxBuffer: 16 * 1024 },
        (error) => resolve(!error)
      )
    })
  }
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

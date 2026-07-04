import { desktopCapturer, screen } from 'electron'
import { execFile } from 'child_process'
import { SCREENSHOT_MAX_WIDTH } from './constants'
import type { ScreenshotCoordinateContext } from './coordinates'

export interface ScreenshotCaptureOptions {
  displayId?: string
  windowId?: string
  windowTitle?: string
  appName?: string
}

export interface ScreenshotCaptureResult {
  image: string
  width: number
  height: number
  actualWidth: number
  actualHeight: number
  coordinateContext: ScreenshotCoordinateContext
  target?: {
    type: 'screen' | 'window'
    id: string
    title: string
  }
}

function getDisplayForSource(
  source: Electron.DesktopCapturerSource,
  requestedDisplayId?: string
): Electron.Display {
  const displays = screen.getAllDisplays()
  const displayId = source.display_id || requestedDisplayId
  const matchedDisplay = displayId
    ? displays.find((display) => String(display.id) === String(displayId))
    : undefined

  return matchedDisplay ?? screen.getPrimaryDisplay()
}

function normalizeTarget(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

function sourceMatchesTarget(
  source: Electron.DesktopCapturerSource,
  options: ScreenshotCaptureOptions
): boolean {
  const windowId = normalizeTarget(options.windowId)
  const windowTitle = normalizeTarget(options.windowTitle)
  const appName = normalizeTarget(options.appName)
  const sourceId = source.id.toLowerCase()
  const sourceName = source.name.toLowerCase()

  if (windowId && sourceId !== windowId && !sourceId.includes(windowId)) return false
  if (windowTitle && !sourceName.includes(windowTitle)) return false
  if (appName && !sourceName.includes(appName)) return false
  return Boolean(windowId || windowTitle || appName)
}

function parseWindowHandle(sourceId: string): number | null {
  const match = /^window:(\d+):/.exec(sourceId)
  if (!match) return null
  const parsed = Number(match[1])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function runPowerShell(script: string): Promise<string> {
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
      { windowsHide: true, timeout: 5000, maxBuffer: 4096 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr?.trim() || error.message))
          return
        }
        resolve(stdout ?? '')
      }
    )
  })
}

async function getWindowBounds(
  source: Electron.DesktopCapturerSource
): Promise<Electron.Rectangle | null> {
  if (process.platform !== 'win32') return null
  const hwnd = parseWindowHandle(source.id)
  if (!hwnd) return null

  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
public static class NativeWin {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
}
"@
$rect = New-Object RECT
if (-not [NativeWin]::GetWindowRect([IntPtr]${hwnd}, [ref]$rect)) { throw "GetWindowRect failed." }
@{ x = $rect.Left; y = $rect.Top; width = ($rect.Right - $rect.Left); height = ($rect.Bottom - $rect.Top) } | ConvertTo-Json -Compress
`

  try {
    const stdout = await runPowerShell(script)
    const parsed = JSON.parse(stdout.trim()) as Partial<Electron.Rectangle>
    if (
      typeof parsed.x === 'number' &&
      typeof parsed.y === 'number' &&
      typeof parsed.width === 'number' &&
      typeof parsed.height === 'number' &&
      parsed.width > 0 &&
      parsed.height > 0
    ) {
      return {
        x: parsed.x,
        y: parsed.y,
        width: parsed.width,
        height: parsed.height,
      }
    }
  } catch {
    return null
  }

  return null
}

function normalizeCaptureOptions(
  displayIdOrOptions?: string | ScreenshotCaptureOptions
): ScreenshotCaptureOptions {
  if (typeof displayIdOrOptions === 'string') return { displayId: displayIdOrOptions }
  return displayIdOrOptions ?? {}
}

export async function captureScreenshot(
  displayIdOrOptions?: string | ScreenshotCaptureOptions
): Promise<ScreenshotCaptureResult> {
  const options = normalizeCaptureOptions(displayIdOrOptions)
  const wantsWindow = Boolean(options.windowId || options.windowTitle || options.appName)
  const sourceTypes: Array<'screen' | 'window'> = wantsWindow ? ['window'] : ['screen']
  const sources = await desktopCapturer.getSources({
    types: sourceTypes,
    thumbnailSize: { width: 3840, height: 2160 },
  })

  let source = sources[0]
  if (wantsWindow) {
    const match = sources.find((s) => sourceMatchesTarget(s, options))
    if (match) source = match
  } else if (options.displayId) {
    const match = sources.find(
      (s) => s.display_id === options.displayId || s.id === options.displayId
    )
    if (match) source = match
  }

  if (!source) {
    throw new Error(
      wantsWindow
        ? 'No matching window source available for capture'
        : 'No screen source available for capture'
    )
  }

  if (wantsWindow && !sourceMatchesTarget(source, options)) {
    throw new Error('No matching window source available for capture')
  }

  let image = source.thumbnail
  const originalSize = image.getSize()

  // Resize if wider than max
  if (originalSize.width > SCREENSHOT_MAX_WIDTH) {
    const scale = SCREENSHOT_MAX_WIDTH / originalSize.width
    image = image.resize({
      width: SCREENSHOT_MAX_WIDTH,
      height: Math.round(originalSize.height * scale),
    })
  }

  const finalSize = image.getSize()
  const base64 = image.toPNG().toString('base64')
  const display = getDisplayForSource(source, options.displayId)
  const windowBounds = wantsWindow ? await getWindowBounds(source) : null
  const coordinateBounds = windowBounds ?? display.bounds

  return {
    image: base64,
    width: finalSize.width,
    height: finalSize.height,
    actualWidth: originalSize.width,
    actualHeight: originalSize.height,
    coordinateContext: {
      displayId: String(display.id),
      displayLabel: display.label || `Display ${display.id}`,
      renderedWidth: finalSize.width,
      renderedHeight: finalSize.height,
      nativeWidth: originalSize.width,
      nativeHeight: originalSize.height,
      displayBounds: {
        x: coordinateBounds.x,
        y: coordinateBounds.y,
        width: coordinateBounds.width,
        height: coordinateBounds.height,
      },
      scaleFactor: display.scaleFactor,
    },
    target: {
      type: wantsWindow ? 'window' : 'screen',
      id: source.id,
      title: source.name,
    },
  }
}

export async function listWindows(): Promise<{ windows: Array<{ title: string; id: string }> }> {
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: 0, height: 0 },
  })
  const windows = sources
    .map((s) => ({ title: s.name, id: s.id }))
    .filter((w) => w.title.trim().length > 0)
  return { windows }
}

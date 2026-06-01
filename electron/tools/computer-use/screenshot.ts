import { desktopCapturer, screen } from 'electron'
import { SCREENSHOT_MAX_WIDTH } from './constants'
import type { ScreenshotCoordinateContext } from './coordinates'

export interface ScreenshotCaptureResult {
  image: string
  width: number
  height: number
  actualWidth: number
  actualHeight: number
  coordinateContext: ScreenshotCoordinateContext
  /**
   * The Agent_Desktop Virtual_Desktop index this capture was redirected to, when
   * the capture was requested for the Agent Desktop (Req 4.2). `undefined` for a
   * normal User_Desktop capture. The Agent Desktop gate
   * (`electron/tools/index.ts`) supplies this so a capture during an agent task
   * targets the Agent_Desktop rather than the User_Desktop; the native
   * per-desktop capture mechanism is owned by the VDA layer. This field makes the
   * redirect target observable to the caller without changing User_Desktop
   * capture behavior, and Agent Desktop never falls back to the User_Desktop.
   */
  agentDesktopIndex?: number
}

function getDisplayForSource(source: Electron.DesktopCapturerSource, requestedDisplayId?: string): Electron.Display {
  const displays = screen.getAllDisplays()
  const displayId = source.display_id || requestedDisplayId
  const matchedDisplay = displayId
    ? displays.find((display) => String(display.id) === String(displayId))
    : undefined

  return matchedDisplay ?? screen.getPrimaryDisplay()
}

export async function captureScreenshot(
  displayId?: string,
  agentDesktopIndex?: number,
): Promise<ScreenshotCaptureResult> {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 3840, height: 2160 },
  })

  let source = sources[0]
  if (displayId) {
    const match = sources.find((s) => s.display_id === displayId || s.id === displayId)
    if (match) source = match
  }

  if (!source) {
    throw new Error('No screen source available for capture')
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
  const display = getDisplayForSource(source, displayId)

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
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height,
      },
      scaleFactor: display.scaleFactor,
    },
    agentDesktopIndex,
  }
}


export async function listWindows(): Promise<{ windows: Array<{ title: string; id: string }> }> {
  const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 } })
  const windows = sources
    .map((s) => ({ title: s.name, id: s.id }))
    .filter((w) => w.title.trim().length > 0)
  return { windows }
}

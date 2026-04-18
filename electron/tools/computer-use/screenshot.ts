import { desktopCapturer, screen } from 'electron'
import { SCREENSHOT_MAX_WIDTH } from './constants'

export async function captureScreenshot(displayId?: string): Promise<{ image: string; width: number; height: number; actualWidth: number; actualHeight: number }> {
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

  return {
    image: base64,
    width: finalSize.width,
    height: finalSize.height,
    actualWidth: originalSize.width,
    actualHeight: originalSize.height,
  }
}

export function getDisplays(): Array<{ id: string; label: string; width: number; height: number; primary: boolean }> {
  return screen.getAllDisplays().map((d) => ({
    id: String(d.id),
    label: d.label || `Display ${d.id}`,
    width: d.size.width,
    height: d.size.height,
    primary: d.id === screen.getPrimaryDisplay().id,
  }))
}


export async function listWindows(): Promise<{ windows: Array<{ title: string; id: string }> }> {
  const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 } })
  const windows = sources
    .map((s) => ({ title: s.name, id: s.id }))
    .filter((w) => w.title.trim().length > 0)
  return { windows }
}

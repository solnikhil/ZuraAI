import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSources: vi.fn(),
  getAllDisplays: vi.fn(),
  getPrimaryDisplay: vi.fn(),
  execFile: vi.fn(),
}))

vi.mock('electron', () => ({
  desktopCapturer: {
    getSources: mocks.getSources,
  },
  screen: {
    getAllDisplays: mocks.getAllDisplays,
    getPrimaryDisplay: mocks.getPrimaryDisplay,
  },
}))

vi.mock('child_process', () => ({
  execFile: mocks.execFile,
  default: {
    execFile: mocks.execFile,
  },
}))

function makeImage(width: number, height: number) {
  return {
    getSize: () => ({ width, height }),
    resize: vi.fn(({ width: nextWidth, height: nextHeight }: { width: number; height: number }) =>
      makeImage(nextWidth, nextHeight)
    ),
    toPNG: () => Buffer.from('png'),
  }
}

describe('computer-use screenshot capture', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    const display = {
      id: 1,
      label: 'Primary',
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      scaleFactor: 1,
    }
    mocks.getAllDisplays.mockReturnValue([display])
    mocks.getPrimaryDisplay.mockReturnValue(display)
    mocks.execFile.mockImplementation((_file, _args, _options, callback) => {
      callback(null, '{"x":100,"y":80,"width":800,"height":600}', '')
    })
  })

  it('captures a specific window source by id', async () => {
    mocks.getSources.mockResolvedValue([
      { id: 'window:11:0', name: 'Other App', thumbnail: makeImage(640, 480), display_id: '' },
      { id: 'window:22:0', name: 'Target App', thumbnail: makeImage(800, 600), display_id: '' },
    ])

    const { captureScreenshot } = await import('./screenshot')
    const result = await captureScreenshot({ windowId: 'window:22:0' })

    expect(mocks.getSources).toHaveBeenCalledWith({
      types: ['window'],
      thumbnailSize: { width: 3840, height: 2160 },
    })
    expect(result.target).toEqual({
      type: 'window',
      id: 'window:22:0',
      title: 'Target App',
    })
    expect(result.width).toBe(800)
    expect(result.height).toBe(600)
    expect(result.image).toBe(Buffer.from('png').toString('base64'))
  })

  it('fails clearly when no requested window source matches', async () => {
    mocks.getSources.mockResolvedValue([
      { id: 'window:11:0', name: 'Other App', thumbnail: makeImage(640, 480), display_id: '' },
    ])

    const { captureScreenshot } = await import('./screenshot')
    await expect(captureScreenshot({ windowTitle: 'Missing' })).rejects.toThrow(
      'No matching window source available for capture'
    )
  })
})

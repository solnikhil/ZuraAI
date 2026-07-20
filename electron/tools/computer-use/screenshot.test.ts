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
      thumbnailSize: { width: 1600, height: 900 },
    })
    expect(result.target).toEqual({
      type: 'window',
      id: 'window:22:0',
      title: 'Target App',
      hwnd: 22,
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

  it('matches an app by owning process when its window title is dynamic', async () => {
    mocks.getSources.mockResolvedValue([
      {
        id: 'window:67908:0',
        name: 'Meek Mill - Going Bad (feat. Drake)',
        thumbnail: makeImage(800, 600),
        display_id: '',
      },
    ])
    mocks.execFile.mockImplementation((_file, args, _options, callback) => {
      const script = String(args.at(-1))
      callback(
        null,
        script.includes('GetWindowThreadProcessId')
          ? '[{"hwnd":67908,"processId":24336,"processName":"Spotify"}]'
          : '{"x":100,"y":80,"width":800,"height":600}',
        ''
      )
    })

    const { captureScreenshot } = await import('./screenshot')
    const result = await captureScreenshot({ appName: 'Spotify' })

    expect(result.target).toEqual({
      type: 'window',
      id: 'window:67908:0',
      title: 'Meek Mill - Going Bad (feat. Drake)',
      hwnd: 67908,
      processId: 24336,
      processName: 'Spotify',
    })
  })

  it('lists stable process and hwnd metadata beside changing titles', async () => {
    mocks.getSources.mockResolvedValue([
      {
        id: 'window:67908:0',
        name: 'Another Song Title',
        thumbnail: makeImage(0, 0),
        display_id: '',
      },
    ])
    mocks.execFile.mockImplementation((_file, _args, _options, callback) => {
      callback(
        null,
        '[{"hwnd":67908,"processId":24336,"processName":"Spotify"}]',
        ''
      )
    })

    const { listWindows } = await import('./screenshot')

    await expect(listWindows()).resolves.toEqual({
      windows: [
        {
          title: 'Another Song Title',
          id: 'window:67908:0',
          hwnd: 67908,
          processId: 24336,
          processName: 'Spotify',
        },
      ],
    })
  })

  it('fails closed when targeted window bounds cannot be verified', async () => {
    mocks.getSources.mockResolvedValue([
      { id: 'window:22:0', name: 'Target App', thumbnail: makeImage(800, 600), display_id: '' },
    ])
    mocks.execFile.mockImplementation((_file, _args, _options, callback) => {
      callback(new Error('GetWindowRect failed'), '', '')
    })

    const { captureScreenshot } = await import('./screenshot')
    await expect(captureScreenshot({ windowId: 'window:22:0' })).rejects.toThrow(
      'target window bounds could not be verified'
    )
  })
})

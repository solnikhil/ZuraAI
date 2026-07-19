import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  captureScreenshot: vi.fn(),
  performClick: vi.fn(async () => undefined),
}))

vi.mock('./screenshot', () => ({
  captureScreenshot: mocks.captureScreenshot,
  listWindows: vi.fn(async () => ({ windows: [] })),
}))

vi.mock('./actions', () => ({
  performClick: mocks.performClick,
  performType: vi.fn(async () => undefined),
  performKeyPress: vi.fn(async () => undefined),
  performScroll: vi.fn(async () => undefined),
  performCursorMove: vi.fn(async () => undefined),
}))

vi.mock('./killSwitch', () => ({
  registerKillSwitch: vi.fn(),
  unregisterKillSwitch: vi.fn(),
}))

vi.mock('./constants', () => ({ ACTION_DELAY_MS: 0, MAX_ACTIONS_PER_SESSION: 100 }))

const coordinateContext = {
  displayId: 'display-1',
  renderedWidth: 100,
  renderedHeight: 100,
  nativeWidth: 100,
  nativeHeight: 100,
  displayBounds: { x: 0, y: 0, width: 100, height: 100 },
  scaleFactor: 1,
}

describe('computer-use screenshot sessions', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const service = await import('./service')
    service.abortSession()
  })

  it('rejects stale and cross-run screenshot ids', async () => {
    mocks.captureScreenshot.mockResolvedValue({
      image: 'same-image',
      width: 100,
      height: 100,
      coordinateContext,
    })
    const service = await import('./service')
    const screenshot = await service.executeScreenshot({}, { sessionKey: 'sender:run-1' })
    const screenshotId = (screenshot.data as { screenshotId: string }).screenshotId

    await expect(
      service.executeClick(
        { screenshot_id: screenshotId, x: 10, y: 20 },
        true,
        undefined,
        'sender:run-2'
      )
    ).resolves.toMatchObject({ success: false, error: expect.stringContaining('this run') })

    const firstClick = await service.executeClick(
      { screenshot_id: screenshotId, x: 10, y: 20 },
      true,
      undefined,
      'sender:run-1'
    )
    expect(firstClick).toMatchObject({
      success: true,
      data: { visualChange: 'unchanged', screenshotId: expect.any(String) },
    })

    await expect(
      service.executeClick(
        { screenshot_id: screenshotId, x: 10, y: 20 },
        true,
        undefined,
        'sender:run-1'
      )
    ).resolves.toMatchObject({ success: false, error: expect.stringContaining('stale') })
  })
})

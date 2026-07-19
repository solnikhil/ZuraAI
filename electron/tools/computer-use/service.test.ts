import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  captureScreenshot: vi.fn(),
  performClick: vi.fn(async (_args, target) => ({
    targeted: Boolean(target),
    foregroundVerified: Boolean(target),
    hitTestVerified: Boolean(target),
    ...(target ? { targetHwnd: target.hwnd } : {}),
  })),
  extractOcrElements: vi.fn(async () => ({
    status: 'available' as const,
    elements: [
      {
        element_id: 'ocr_test',
        source: 'ocr' as const,
        background_safe: false as const,
        role: 'Text' as const,
        text: 'Punjabi',
        bounds: { x: 20, y: 30, width: 40, height: 10 },
      },
    ],
  })),
}))

vi.mock('./ocr', () => ({ extractOcrElements: mocks.extractOcrElements }))

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
      target: { type: 'window', id: 'window:22:0', title: 'Target', hwnd: 22 },
    })
    const service = await import('./service')
    const screenshot = await service.executeScreenshot({}, { sessionKey: 'sender:run-1' })
    const screenshotId = (screenshot.data as { screenshotId: string }).screenshotId
    expect(screenshot).toMatchObject({
      success: true,
      data: {
        ocr: {
          status: 'available',
          elements: [{ text: 'Punjabi', background_safe: false }],
        },
      },
    })

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
      data: {
        visualChange: 'unchanged',
        screenshotId: expect.any(String),
        ocr: { status: 'available', elements: [{ text: 'Punjabi' }] },
        delivery: {
          targeted: true,
          foregroundVerified: true,
          hitTestVerified: true,
          targetHwnd: 22,
        },
      },
    })
    expect(mocks.performClick).toHaveBeenCalledWith(
      { screenshot_id: screenshotId, x: 10, y: 20 },
      { hwnd: 22, capturedBounds: coordinateContext.displayBounds }
    )

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

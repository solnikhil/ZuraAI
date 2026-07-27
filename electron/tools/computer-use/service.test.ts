import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  captureScreenshot: vi.fn(),
  tryBackgroundActivateAtPoint: vi.fn(async () => ({
    status: 'unsupported' as const,
    reason: 'No provider action owns the point.',
  })),
  performClick: vi.fn(async (_args, target) => ({
    targeted: Boolean(target),
    foregroundVerified: Boolean(target),
    hitTestVerified: Boolean(target),
    ...(target ? { targetHwnd: target.hwnd } : {}),
  })),
  performType: vi.fn(async (_args, target) => ({
    mode: 'foreground_targeted' as const,
    targeted: Boolean(target),
    backgroundSafe: false as const,
    foregroundVerified: Boolean(target),
    foregroundMaintained: Boolean(target),
    targetHwnd: target?.hwnd,
    restoredPreviousForeground: true,
  })),
  performKeyPress: vi.fn(async (_args, target) => ({
    mode: 'foreground_targeted' as const,
    targeted: Boolean(target),
    backgroundSafe: false as const,
    foregroundVerified: Boolean(target),
    foregroundMaintained: Boolean(target),
    targetHwnd: target?.hwnd,
    restoredPreviousForeground: true,
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
vi.mock('../ui-automation/service', () => ({
  tryBackgroundActivateAtPoint: mocks.tryBackgroundActivateAtPoint,
}))

vi.mock('./screenshot', () => ({
  captureScreenshot: mocks.captureScreenshot,
  listWindows: vi.fn(async () => ({ windows: [] })),
}))

vi.mock('./actions', () => ({
  performClick: mocks.performClick,
  performType: mocks.performType,
  performKeyPress: mocks.performKeyPress,
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
    const screenshot = await service.executeScreenshot(
      { window_id: 'window:22:0' },
      { sessionKey: 'sender:run-1' }
    )
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
          mode: 'physical',
          backgroundSafe: false,
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

  it('uses a provider-backed background action without preparing foreground input', async () => {
    mocks.captureScreenshot.mockResolvedValue({
      image: 'same-image',
      width: 100,
      height: 100,
      coordinateContext,
      target: { type: 'window', id: 'window:22:0', title: 'Target', hwnd: 22 },
    })
    mocks.tryBackgroundActivateAtPoint.mockResolvedValueOnce({
      status: 'dispatched',
      element_id: 'uie_button',
      source: 'uia',
      action: 'click',
      role: 'Button',
      name: 'Play',
      semanticOutcome: 'unverified',
    })
    const prepareForeground = vi.fn(async () => undefined)
    const service = await import('./service')
    const screenshot = await service.executeScreenshot(
      { window_id: 'window:22:0' },
      { sessionKey: 'sender:background' }
    )
    const screenshotId = (screenshot.data as { screenshotId: string }).screenshotId

    const result = await service.executeClick(
      { screenshot_id: screenshotId, x: 10, y: 20 },
      true,
      undefined,
      'sender:background',
      prepareForeground
    )

    expect(result).toMatchObject({
      success: true,
      data: {
        delivery: {
          mode: 'background_automation',
          targeted: true,
          backgroundSafe: true,
          status: 'dispatched',
          element_id: 'uie_button',
          source: 'uia',
          semanticOutcome: 'unverified',
        },
      },
    })
    expect(prepareForeground).not.toHaveBeenCalled()
    expect(mocks.performClick).not.toHaveBeenCalled()
  })

  it('returns foreground_required without physical fallback for a reserved app', async () => {
    mocks.captureScreenshot.mockResolvedValue({
      image: 'same-image',
      width: 100,
      height: 100,
      coordinateContext,
      target: { type: 'window', id: 'window:22:0', title: 'Target', hwnd: 22 },
    })
    const service = await import('./service')
    const screenshot = await service.executeScreenshot(
      { window_id: 'window:22:0' },
      { sessionKey: 'sender:reserved' }
    )
    const screenshotId = (screenshot.data as { screenshotId: string }).screenshotId

    const result = await service.executeClick(
      { screenshot_id: screenshotId, x: 10, y: 20 },
      true,
      undefined,
      'sender:reserved',
      undefined,
      false
    )

    expect(result).toMatchObject({
      success: false,
      data: {
        status: 'foreground_required',
        action: 'computer_click',
        hwnd: 22,
      },
    })
    expect(mocks.performClick).not.toHaveBeenCalled()
  })

  it('automatically locks shortcuts and text to the captured app HWND', async () => {
    mocks.captureScreenshot.mockResolvedValue({
      image: 'same-image',
      width: 100,
      height: 100,
      coordinateContext,
      target: { type: 'window', id: 'window:22:0', title: 'Target', hwnd: 22 },
    })
    const service = await import('./service')
    const screenshot = await service.executeScreenshot(
      { app_name: 'Discord' },
      { sessionKey: 'sender:keyboard' }
    )
    const firstId = (screenshot.data as { screenshotId: string }).screenshotId

    const keyResult = await service.executeKey(
      { screenshot_id: firstId, key: 'ctrl+k' },
      true,
      'sender:keyboard'
    )
    const secondId = (keyResult.data as { screenshotId: string }).screenshotId
    const typeResult = await service.executeType(
      { screenshot_id: secondId, text: 'Hector' },
      true,
      'sender:keyboard'
    )

    expect(mocks.performKeyPress).toHaveBeenCalledWith(
      { screenshot_id: firstId, key: 'ctrl+k' },
      { hwnd: 22 }
    )
    expect(mocks.performType).toHaveBeenCalledWith(
      { screenshot_id: secondId, text: 'Hector' },
      { hwnd: 22 }
    )
    expect(typeResult).toMatchObject({
      success: true,
      data: {
        delivery: {
          mode: 'foreground_targeted',
          targeted: true,
          targetHwnd: 22,
          restoredPreviousForeground: true,
        },
      },
    })
  })

  it('rejects keyboard input from a whole-screen screenshot', async () => {
    mocks.captureScreenshot.mockResolvedValue({
      image: 'screen-image',
      width: 100,
      height: 100,
      coordinateContext,
      target: { type: 'screen', id: 'screen:0:0', title: 'Screen' },
    })
    const service = await import('./service')
    const screenshot = await service.executeScreenshot({}, { sessionKey: 'sender:screen' })
    const screenshotId = (screenshot.data as { screenshotId: string }).screenshotId

    await expect(
      service.executeKey({ screenshot_id: screenshotId, key: 'ctrl+k' }, true, 'sender:screen')
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('window-targeted screenshot'),
    })
    expect(mocks.performKeyPress).not.toHaveBeenCalled()
  })
})

import { describe, expect, it } from 'vitest'
import {
  backgroundWindowFocusBlocked,
  backgroundWindowPhysicalInputBlocked,
  normalizeBackgroundScreenshotResult,
  scopeScreenshotToBackgroundTarget,
} from './toolPolicy'

const target = {
  hwnd: 67850,
  processId: 25044,
  processStartTimeMs: 123456,
  title: 'Spotify Premium',
}

describe('background window tool policy', () => {
  it('scopes screenshots to the main-owned exact window handle', () => {
    expect(scopeScreenshotToBackgroundTarget(target)).toEqual({ window_id: 'window:67850:0' })
  })

  it('requires an explicit release before window_focus can steal foreground', () => {
    expect(backgroundWindowFocusBlocked(target)).toEqual(
      expect.objectContaining({
        success: false,
        data: expect.objectContaining({
          status: 'foreground_required',
          action: 'window_focus',
          hwnd: 67850,
        }),
      })
    )
  })

  it('keeps shared keyboard input out of a reserved background window', () => {
    for (const action of [
      'computer_cursor_position',
      'computer_key',
      'computer_scroll',
      'computer_type',
    ] as const) {
      expect(backgroundWindowPhysicalInputBlocked(target, action)).toEqual(
        expect.objectContaining({
          success: false,
          data: expect.objectContaining({
            status: 'foreground_required',
            action,
            hwnd: 67850,
          }),
        })
      )
    }
  })

  it('returns a typed blocked result when Windows cannot capture the reserved window', () => {
    expect(
      normalizeBackgroundScreenshotResult(
        { success: false, error: 'No matching window source available for capture' },
        target
      )
    ).toEqual(
      expect.objectContaining({
        success: false,
        data: expect.objectContaining({
          status: 'blocked',
          reason: 'screenshot_unavailable',
          hwnd: 67850,
        }),
      })
    )
  })
})

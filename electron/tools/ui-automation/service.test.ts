import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  runPowerShell: vi.fn(),
  captureScreenshot: vi.fn(),
}))

vi.mock('electron', () => ({
  screen: {
    getAllDisplays: () => [{ bounds: { x: 0, y: 0, width: 1920, height: 1080 } }],
  },
  clipboard: {
    readText: () => '',
    writeText: () => {},
  },
  desktopCapturer: {
    getSources: async () => [],
  },
}))

vi.mock('../native-common', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../native-common')>()
  return {
    ...actual,
    isWindows: () => true,
    runPowerShell: mocks.runPowerShell,
  }
})

vi.mock('../computer-use/screenshot', () => ({
  captureScreenshot: mocks.captureScreenshot,
}))

import {
  executeUiClick,
  executeUiGetAppState,
  executeUiKey,
  executeUiTypeText,
  findElementsInState,
} from './service'
import type { UiAppState } from './types'

function makeState(): UiAppState {
  return {
    state_id: 'uis_test',
    captured_at: 1,
    screenshot: {
      status: 'available',
      image: '',
      screenWidth: 100,
      screenHeight: 100,
      coordinateContext: {},
    },
    windows: [
      {
        hwnd: 100,
        title: 'Demo',
        process_id: 10,
        process_name: 'demo',
        element_id: 'uiw_demo',
        elements: [
          {
            element_id: 'uie_parent',
            source: 'uia',
            background_safe: false,
            name: 'Settings',
            role: 'Pane',
            automation_id: 'settings-pane',
            class_name: 'Pane',
            enabled: true,
            focused: false,
            visible: true,
            bounds: { x: 0, y: 0, width: 200, height: 200 },
            supported_actions: ['focus'],
            children: [
              {
                element_id: 'uie_save',
                source: 'uia',
                background_safe: true,
                parent_element_id: 'uie_parent',
                name: 'Save',
                value: 'Ready',
                role: 'Button',
                automation_id: 'save-button',
                class_name: 'Button',
                enabled: true,
                focused: false,
                visible: true,
                bounds: { x: 10, y: 10, width: 80, height: 30 },
                supported_actions: ['focus', 'click'],
                children: [],
              },
              {
                element_id: 'uie_disabled',
                source: 'uia',
                background_safe: true,
                parent_element_id: 'uie_parent',
                name: 'Delete',
                role: 'Button',
                automation_id: 'delete-button',
                class_name: 'Button',
                enabled: false,
                focused: false,
                visible: true,
                bounds: { x: 10, y: 50, width: 80, height: 30 },
                supported_actions: ['focus', 'click'],
                children: [],
              },
            ],
          },
        ],
      },
    ],
    truncation: {
      max_depth: 4,
      max_elements: 120,
      element_count: 3,
      truncated: false,
    },
  }
}

describe('ui automation findElementsInState', () => {
  it('matches by role, name, value, and enabled state', () => {
    const matches = findElementsInState(makeState(), {
      role: 'Button',
      name: 'sav',
      value: 'read',
      enabled: true,
    })

    expect(matches.map((match) => match.element_id)).toEqual(['uie_save'])
  })

  it('supports parent-scoped search', () => {
    const matches = findElementsInState(makeState(), {
      parent_element_id: 'uie_parent',
      query: 'delete',
    })

    expect(matches.map((match) => match.element_id)).toEqual(['uie_disabled'])
  })

  it('respects result limits', () => {
    const matches = findElementsInState(makeState(), {
      role: 'Button',
      limit: 1,
    })

    expect(matches).toHaveLength(1)
  })
})

const rawSnapshot = (supportedPatterns: string[] = ['Invoke', 'Value']) => ({
  activeWindow: {
    hwnd: 100,
    title: 'Demo',
    processId: 10,
    processName: 'demo',
  },
  windows: [
    {
      hwnd: 100,
      title: 'Demo',
      processId: 10,
      processName: 'demo',
      runtimeId: '1.2',
      elements: [
        {
          runtimeId: '1.2.3',
          name: 'Save',
          automationId: 'save-button',
          controlType: 'Button',
          className: 'Button',
          enabled: true,
          focused: false,
          visible: true,
          bounds: { x: 10, y: 10, width: 80, height: 30 },
          supportedPatterns,
        },
      ],
    },
  ],
  elementCount: 1,
  truncated: false,
})

describe('strict background UI automation actions', () => {
  beforeEach(() => {
    mocks.runPowerShell.mockReset()
    mocks.captureScreenshot.mockReset()
    mocks.captureScreenshot.mockResolvedValue({
      image: 'image',
      width: 100,
      height: 100,
      actualWidth: 100,
      actualHeight: 100,
      coordinateContext: {
        displayId: '1',
        displayLabel: 'Display 1',
        renderedWidth: 100,
        renderedHeight: 100,
        nativeWidth: 100,
        nativeHeight: 100,
        displayBounds: { x: 0, y: 0, width: 100, height: 100 },
        scaleFactor: 1,
      },
      target: { type: 'window', id: 'window:100:0', title: 'Demo' },
    })
  })

  async function seedElement(supportedPatterns?: string[]): Promise<string> {
    mocks.runPowerShell.mockResolvedValueOnce({
      stdout: JSON.stringify(rawSnapshot(supportedPatterns)),
      stderr: '',
    })
    const result = await executeUiGetAppState({ hwnd: 100 })
    expect(result.success).toBe(true)
    return (result.data as { state: UiAppState }).state.windows[0]?.elements[0]?.element_id || ''
  }

  it('normalizes singleton PowerShell windows, elements, and supported patterns', async () => {
    const singletonSnapshot = {
      ...rawSnapshot(),
      windows: {
        ...rawSnapshot().windows[0],
        elements: {
          ...rawSnapshot().windows[0].elements[0],
          supportedPatterns: 'Invoke',
        },
      },
    }
    mocks.runPowerShell.mockResolvedValueOnce({
      stdout: JSON.stringify(singletonSnapshot),
      stderr: '',
    })

    const result = await executeUiGetAppState({ hwnd: 100 })

    expect(result.success).toBe(true)
    const state = (result.data as { state: UiAppState }).state
    expect(state.windows).toHaveLength(1)
    expect(state.windows[0]?.elements).toHaveLength(1)
    expect(state.windows[0]?.elements[0]?.supported_actions).toEqual(['click'])
    const snapshotPowerShell = mocks.runPowerShell.mock.calls[0]?.[0] as string
    expect(snapshotPowerShell).toContain('supportedPatterns = @(Get-PatternNames $child)')
    expect(snapshotPowerShell).toContain('$elements = @(Walk $window $null 1)')
    expect(snapshotPowerShell).toContain('elements = @($elements)')
    expect(snapshotPowerShell).toContain('[ZuraLegacyAccessibility]::Capture')
  })

  it('normalizes MSAA fallback elements and invokes their validated default action', async () => {
    const legacySnapshot = rawSnapshot(['LegacyDefaultAction'])
    legacySnapshot.windows[0]!.elements[0] = {
      ...legacySnapshot.windows[0]!.elements[0],
      runtimeId: 'legacy:0/2',
      name: 'Punjabi',
      controlType: 'ListItem',
      className: 'MSAA',
      source: 'msaa',
    }
    mocks.runPowerShell.mockResolvedValueOnce({
      stdout: JSON.stringify(legacySnapshot),
      stderr: '',
    })

    const stateResult = await executeUiGetAppState({ hwnd: 100 })
    const element = (stateResult.data as { state: UiAppState }).state.windows[0]?.elements[0]
    expect(element).toMatchObject({
      name: 'Punjabi',
      source: 'msaa',
      background_safe: true,
      supported_actions: ['click'],
    })

    mocks.runPowerShell
      .mockResolvedValueOnce({ stdout: '{"action":"legacyInvoke"}', stderr: '' })
      .mockResolvedValueOnce({ stdout: JSON.stringify(legacySnapshot), stderr: '' })
    const clickResult = await executeUiClick({
      element_id: element?.element_id,
      autoApprove: true,
    })

    expect(clickResult.success).toBe(true)
    const actionScript = mocks.runPowerShell.mock.calls[1]?.[0] as string
    expect(actionScript).toContain('[ZuraLegacyAccessibility]::Invoke')
    expect(actionScript).toContain("'legacy:0/2'")
    expect(actionScript).toContain("'Punjabi'")
    expect(actionScript).toContain('ProcessId -ne 10')
  })

  it('preserves a successful accessibility tree when targeted capture is unavailable', async () => {
    mocks.runPowerShell.mockResolvedValueOnce({
      stdout: JSON.stringify(rawSnapshot(['Invoke'])),
      stderr: '',
    })
    mocks.captureScreenshot.mockRejectedValueOnce(
      new Error('No matching window source available for capture')
    )

    const result = await executeUiGetAppState({ hwnd: 100 })

    expect(result.success).toBe(true)
    const state = (result.data as { state: UiAppState }).state
    expect(state.windows[0]?.elements[0]).toMatchObject({
      name: 'Save',
      supported_actions: ['click'],
    })
    expect(state.screenshot).toEqual({
      status: 'unavailable',
      reason: 'screenshot_unavailable',
      message: expect.stringContaining('accessibility tree remains valid'),
    })
    expect(mocks.captureScreenshot).toHaveBeenCalledTimes(1)
    expect(mocks.captureScreenshot).toHaveBeenCalledWith({ windowId: 'window:100:0' })
  })

  it('does not hide unexpected screenshot failures', async () => {
    mocks.runPowerShell.mockResolvedValueOnce({
      stdout: JSON.stringify(rawSnapshot()),
      stderr: '',
    })
    mocks.captureScreenshot.mockRejectedValueOnce(
      new Error('desktopCapturer initialization failed')
    )

    const result = await executeUiGetAppState({ hwnd: 100 })

    expect(result).toMatchObject({
      success: false,
      error: 'desktopCapturer initialization failed',
    })
  })

  it('scopes runtime lookup and fresh verification to the cached HWND', async () => {
    const elementId = await seedElement()
    mocks.runPowerShell
      .mockResolvedValueOnce({ stdout: '{"action":"invoke"}', stderr: '' })
      .mockResolvedValueOnce({ stdout: JSON.stringify(rawSnapshot()), stderr: '' })

    const result = await executeUiClick({ element_id: elementId, autoApprove: true })

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({ status: 'completed' })
    const actionScript = mocks.runPowerShell.mock.calls[1]?.[0] as string
    expect(actionScript).toContain('NativeWindowHandleProperty, 100')
    expect(actionScript).toContain('ProcessId -ne 10')
    expect(actionScript).toContain('$window.FindAll')
    expect(actionScript).not.toContain(
      '$root.FindAll([System.Windows.Automation.TreeScope]::Subtree'
    )
    expect(mocks.captureScreenshot).toHaveBeenLastCalledWith({ windowId: 'window:100:0' })
  })

  it('returns foreground_required instead of falling back to coordinates', async () => {
    const elementId = await seedElement([])
    const result = await executeUiClick({
      element_id: elementId,
      x: 20,
      y: 20,
      autoApprove: true,
    })

    expect(result).toMatchObject({
      success: false,
      data: { status: 'foreground_required', action: 'click', hwnd: 100 },
    })
    expect(mocks.runPowerShell).toHaveBeenCalledTimes(1)
  })

  it('uses ValuePattern for background text entry', async () => {
    const elementId = await seedElement(['Value'])
    mocks.runPowerShell
      .mockResolvedValueOnce({ stdout: '{"action":"setValue"}', stderr: '' })
      .mockResolvedValueOnce({ stdout: JSON.stringify(rawSnapshot(['Value'])), stderr: '' })

    const result = await executeUiTypeText({
      element_id: elementId,
      text: 'hello',
      autoApprove: true,
    })

    expect(result.success).toBe(true)
    expect(mocks.runPowerShell.mock.calls[1]?.[0]).toContain("switch ('setValue')")
    expect(mocks.runPowerShell.mock.calls[1]?.[0]).toContain("$pattern.SetValue('hello')")
  })

  it('reports stale or reused target identity as blocked', async () => {
    const elementId = await seedElement(['Invoke'])
    mocks.runPowerShell.mockRejectedValueOnce(
      new Error('ZURA_UIA_TARGET_CHANGED: Target window identity changed.')
    )

    const result = await executeUiClick({ element_id: elementId, autoApprove: true })

    expect(result).toMatchObject({
      success: false,
      data: {
        status: 'blocked',
        reason: 'target_changed',
        hwnd: 100,
      },
    })
  })

  it('marks keyboard injection as foreground-only without executing it', async () => {
    const result = await executeUiKey({ key: 'ctrl+c', autoApprove: true })
    expect(result).toMatchObject({
      success: false,
      data: { status: 'foreground_required', action: 'key' },
    })
    expect(mocks.runPowerShell).not.toHaveBeenCalled()
  })
})

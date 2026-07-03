import { describe, expect, it, vi } from 'vitest'

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

import { findElementsInState } from './service'
import type { UiAppState } from './types'

function makeState(): UiAppState {
  return {
    state_id: 'uis_test',
    captured_at: 1,
    screenshot: {
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

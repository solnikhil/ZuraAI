import { describe, expect, it } from 'vitest'

import { normalizeStoredSettings } from './settingsStore'

describe('normalizeStoredSettings overlay', () => {
  it('hydrates default overlay settings when missing', () => {
    const settings = normalizeStoredSettings('{}')

    expect(settings.overlay).toEqual({
      enabled: false,
      launchOnStartup: false,
      hotkey: 'CommandOrControl+Shift+/',
      anchor: 'right',
      compactWidth: 360,
      expandedWidth: 460,
      promptAutoHideEnabled: false,
      promptAutoHideTimeout: 120,
    })
  })

  it('merges stored overlay values while keeping the phase-1 right anchor', () => {
    const settings = normalizeStoredSettings(
      JSON.stringify({
        overlay: {
          enabled: true,
          launchOnStartup: true,
          hotkey: 'Alt+Space',
          anchor: 'left',
          compactWidth: 420,
        },
      })
    )

    expect(settings.overlay).toEqual({
      enabled: true,
      launchOnStartup: true,
      hotkey: 'Alt+Space',
      anchor: 'right',
      compactWidth: 420,
      expandedWidth: 460,
      promptAutoHideEnabled: false,
      promptAutoHideTimeout: 120,
    })
  })

  it('migrates legacy buddyOverlay settings when overlay is missing', () => {
    const settings = normalizeStoredSettings(
      JSON.stringify({
        buddyOverlay: {
          enabled: true,
          launchOnStartup: true,
          hotkey: 'Alt+Z',
          anchor: 'left',
          compactWidth: 400,
          expandedWidth: 520,
          promptAutoHideEnabled: true,
          promptAutoHideTimeout: 90,
        },
      })
    )

    expect(settings.overlay).toEqual({
      enabled: true,
      launchOnStartup: true,
      hotkey: 'Alt+Z',
      anchor: 'right',
      compactWidth: 400,
      expandedWidth: 520,
      promptAutoHideEnabled: true,
      promptAutoHideTimeout: 90,
    })
  })
})

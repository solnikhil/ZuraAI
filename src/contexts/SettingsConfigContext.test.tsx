import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const bootstrapMocks = vi.hoisted(() => ({
  loadSecureSettingPresence: vi.fn(),
  discoverStartupOllamaModels: vi.fn(),
  syncReminderExtensionState: vi.fn(),
}))

vi.mock('./settingsBootstrap', () => bootstrapMocks)

import { SettingsConfigProvider, useSettingsConfig } from './SettingsConfigContext'

function Probe() {
  const { settingsConfig, isSecureStorageLoaded, updateSettingsConfig } = useSettingsConfig()
  return (
    <div>
      <div data-testid="secure-loaded">{String(isSecureStorageLoaded)}</div>
      <div data-testid="active-model">{settingsConfig.aiModel}</div>
      <button
        onClick={() => {
          const extensions = {
            ...settingsConfig.extensions,
            reminders: { ...settingsConfig.extensions.reminders, enabled: true },
          }
          updateSettingsConfig({ extensions, skills: extensions })
        }}
      >
        enable reminders
      </button>
    </div>
  )
}

describe('SettingsConfigProvider bootstrap behavior', () => {
  beforeEach(() => {
    bootstrapMocks.loadSecureSettingPresence.mockReset().mockResolvedValue({})
    bootstrapMocks.discoverStartupOllamaModels.mockReset().mockResolvedValue([])
    bootstrapMocks.syncReminderExtensionState.mockReset().mockResolvedValue(undefined)
  })

  it('opens the provider gate with defaults when secure presence loading fails', async () => {
    bootstrapMocks.loadSecureSettingPresence.mockRejectedValueOnce(new Error('secure unavailable'))
    render(
      <SettingsConfigProvider>
        <Probe />
      </SettingsConfigProvider>
    )

    expect(await screen.findByTestId('secure-loaded')).toHaveTextContent('true')
    expect(screen.getByTestId('active-model')).toBeEmptyDOMElement()
  })

  it('applies changed initialSettings without remounting the provider', async () => {
    const view = render(
      <SettingsConfigProvider initialSettings={{ aiModel: 'test/model-one' }}>
        <Probe />
      </SettingsConfigProvider>
    )
    expect(await screen.findByTestId('active-model')).toHaveTextContent('test/model-one')

    view.rerender(
      <SettingsConfigProvider initialSettings={{ aiModel: 'test/model-two' }}>
        <Probe />
      </SettingsConfigProvider>
    )
    await waitFor(() =>
      expect(screen.getByTestId('active-model')).toHaveTextContent('test/model-two')
    )
  })

  it('synchronizes reminder extension changes through the bootstrap boundary', async () => {
    render(
      <SettingsConfigProvider>
        <Probe />
      </SettingsConfigProvider>
    )
    await screen.findByText('enable reminders')
    fireEvent.click(screen.getByText('enable reminders'))

    await waitFor(() =>
      expect(bootstrapMocks.syncReminderExtensionState).toHaveBeenLastCalledWith(true)
    )
  })
})

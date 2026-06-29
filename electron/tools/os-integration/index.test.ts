import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('os-integration tools', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('opens only allowlisted Windows Settings pages', async () => {
    const openExternal = vi.fn(async () => undefined)
    vi.doMock('electron', () => ({
      shell: {
        openExternal,
        openPath: vi.fn(),
      },
    }))

    const tools = await import('./index')

    await expect(tools.executeSystemSettingsOpen({ page: 'display', autoApprove: true })).resolves.toEqual({
      success: true,
      data: { page: 'display' },
    })
    await expect(tools.executeSystemSettingsOpen({ page: 'ms-settings:privacy-webcam', autoApprove: true })).resolves.toEqual({
      success: false,
      error: 'page must be one of: display, sound, bluetooth, network, notifications, apps, privacy.',
    })

    expect(openExternal).toHaveBeenCalledWith('ms-settings:display')
    expect(openExternal).toHaveBeenCalledTimes(1)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { openExternal } = vi.hoisted(() => ({ openExternal: vi.fn(async () => undefined) }))

vi.mock('electron', () => ({ shell: { openExternal } }))

import { installExternalNavigationGuards, isExternalHttpUrl } from './externalNavigation'

describe('external navigation guards', () => {
  beforeEach(() => openExternal.mockClear())

  it('compares development URLs by exact origin', () => {
    const devServer = 'http://localhost:5173'
    expect(isExternalHttpUrl('http://localhost:5173/settings', devServer)).toBe(false)
    expect(isExternalHttpUrl('http://localhost:5173@evil.example/path', devServer)).toBe(true)
    expect(isExternalHttpUrl('https://example.com/path', devServer)).toBe(true)
  })

  it('rejects non-HTTP protocols and malformed URLs', () => {
    expect(isExternalHttpUrl('file:///C:/Windows/System32/calc.exe')).toBe(false)
    expect(isExternalHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isExternalHttpUrl('not a URL')).toBe(false)
  })

  it('denies all renderer navigation and opens only external HTTP links', () => {
    let openHandler: ((details: { url: string }) => { action: string }) | undefined
    let navigateHandler: ((event: { preventDefault: () => void }, url: string) => void) | undefined
    const webContents = {
      setWindowOpenHandler: vi.fn((handler) => {
        openHandler = handler
      }),
      on: vi.fn((event, handler) => {
        if (event === 'will-navigate') navigateHandler = handler
      }),
    }

    installExternalNavigationGuards(
      { webContents } as unknown as Electron.BrowserWindow,
      'http://localhost:5173'
    )

    expect(openHandler?.({ url: 'https://example.com' })).toEqual({ action: 'deny' })
    expect(openExternal).toHaveBeenCalledWith('https://example.com')

    const preventDefault = vi.fn()
    navigateHandler?.({ preventDefault }, 'file:///C:/Windows/System32/calc.exe')
    expect(preventDefault).toHaveBeenCalledOnce()
    expect(openExternal).toHaveBeenCalledTimes(1)
  })
})

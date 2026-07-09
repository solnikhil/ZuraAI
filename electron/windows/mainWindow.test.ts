import path from 'path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn(() => '/tmp/zura-test'),
  },
  BrowserWindow: vi.fn(),
  shell: {
    openExternal: vi.fn(),
  },
}))

import { getAppQuitting, resolveDistPath, setAppQuitting } from './mainWindow'

describe('resolveDistPath', () => {
  it('prefers the injected DIST path when available', () => {
    expect(resolveDistPath('C:/app/dist-electron', 'C:/app/dist')).toBe('C:/app/dist')
  })

  it('falls back to the bundled sibling dist directory', () => {
    expect(resolveDistPath('C:/app/dist-electron', undefined)).toBe(
      path.join('C:/app/dist-electron', '../dist')
    )
  })
})

describe('macOS quit vs hide flag', () => {
  it('tracks setAppQuitting for close-to-hide vs destroy', () => {
    setAppQuitting(false)
    expect(getAppQuitting()).toBe(false)
    setAppQuitting(true)
    expect(getAppQuitting()).toBe(true)
    setAppQuitting(false)
    expect(getAppQuitting()).toBe(false)
  })
})

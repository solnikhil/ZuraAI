import { afterEach, describe, expect, it, vi } from 'vitest'
import { writeTextToClipboard } from './clipboard'

function setClipboard(writeText?: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: writeText ? { writeText } : undefined,
  })
}

function setExecCommand(handler: (commandId: string) => boolean) {
  Object.defineProperty(document, 'execCommand', {
    configurable: true,
    value: vi.fn(handler),
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('writeTextToClipboard', () => {
  it('uses Clipboard API when available', async () => {
    const writeText = vi.fn(async () => {})
    setClipboard(writeText)
    setExecCommand(() => true)

    const copied = await writeTextToClipboard('hello world')

    expect(copied).toBe(true)
    expect(writeText).toHaveBeenCalledWith('hello world')
    expect(document.execCommand).not.toHaveBeenCalled()
  })

  it('falls back to execCommand when Clipboard API fails', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('permission denied')
    })
    setClipboard(writeText)
    setExecCommand((commandId) => commandId === 'copy')

    const copied = await writeTextToClipboard('fallback copy')

    expect(copied).toBe(true)
    expect(writeText).toHaveBeenCalledWith('fallback copy')
    expect(document.execCommand).toHaveBeenCalledWith('copy')
  })

  it('returns false when Clipboard API and fallback both fail', async () => {
    setClipboard(undefined)
    setExecCommand(() => {
      throw new Error('copy failed')
    })

    const copied = await writeTextToClipboard('cannot copy')

    expect(copied).toBe(false)
    expect(document.execCommand).toHaveBeenCalledWith('copy')
  })
})

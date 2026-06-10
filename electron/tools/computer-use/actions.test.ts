import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest'

const clipboardStore = { text: '' }

vi.mock('electron', () => ({
  screen: { getAllDisplays: () => [] },
  clipboard: {
    readText: () => clipboardStore.text,
    writeText: (t: string) => {
      clipboardStore.text = t
    },
  },
}))

const keyboard = {
  type: vi.fn(async () => {}),
  pressKey: vi.fn(async () => {}),
  releaseKey: vi.fn(async () => {}),
}
const Key = { LeftControl: 1, LeftSuper: 2, V: 3 }
const fakeNut = { keyboard, Key } as unknown as typeof import('@nut-tree-fork/nut-js')

import { performType, __setNutForTesting } from './actions'

describe('performType', () => {
  beforeEach(() => {
    __setNutForTesting(fakeNut)
    clipboardStore.text = 'original'
    keyboard.type.mockReset()
    keyboard.pressKey.mockReset()
    keyboard.releaseKey.mockReset()
  })

  afterAll(() => {
    __setNutForTesting(null)
  })

  it('pastes text via the clipboard and restores prior contents', async () => {
    let writtenDuringPaste = ''
    keyboard.pressKey.mockImplementationOnce(async () => {
      writtenDuringPaste = clipboardStore.text
    })

    await performType({ text: 'hello world' })

    expect(writtenDuringPaste).toBe('hello world')
    expect(keyboard.pressKey).toHaveBeenCalled()
    expect(keyboard.releaseKey).toHaveBeenCalled()
    expect(clipboardStore.text).toBe('original')
  })

  it('falls back to keystroke typing when paste fails', async () => {
    keyboard.pressKey.mockRejectedValueOnce(new Error('paste blocked'))

    await performType({ text: 'fallback text' })

    expect(keyboard.type).toHaveBeenCalledWith('fallback text')
    expect(clipboardStore.text).toBe('original')
  })
})

import { describe, expect, it, vi, beforeEach } from 'vitest'

const clipboardStore = { text: '' }
const { execFileMock } = vi.hoisted(() => ({
  execFileMock: vi.fn((_file, _args, _options, cb) => cb(null, '', '')),
}))

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
  default: { execFile: execFileMock },
}))

vi.mock('electron', () => ({
  screen: { getAllDisplays: () => [] },
  clipboard: {
    readText: () => clipboardStore.text,
    writeText: (t: string) => {
      clipboardStore.text = t
    },
  },
}))

import { performKeyPress, performType } from './actions'

describe('computer-use actions', () => {
  beforeEach(() => {
    clipboardStore.text = 'original'
    execFileMock.mockClear()
  })

  it('pastes text via the clipboard and restores prior contents', async () => {
    await performType({ text: 'hello world' })

    expect(execFileMock).toHaveBeenCalledWith(
      'powershell.exe',
      expect.arrayContaining(['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command']),
      expect.objectContaining({ windowsHide: true }),
      expect.any(Function),
    )
    expect(clipboardStore.text).toBe('original')
  })

  it('maps key combinations to virtual-key User32 calls', async () => {
    await performKeyPress({ key: 'ctrl+shift+s' })

    const script = execFileMock.mock.calls[0][1].at(-1)
    expect(script).toContain('[byte]17')
    expect(script).toContain('[byte]16')
    expect(script).toContain('[byte]83')
  })
})

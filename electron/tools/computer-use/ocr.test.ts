import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  writeFile: vi.fn(async () => undefined),
  unlink: vi.fn(async () => undefined),
  resize: vi.fn(),
  toPNG: vi.fn(() => Buffer.from('png')),
  runPowerShell: vi.fn(),
}))

vi.mock('fs/promises', () => ({
  default: { writeFile: mocks.writeFile, unlink: mocks.unlink },
}))

vi.mock('electron', () => ({
  nativeImage: {
    createFromBuffer: vi.fn(() => ({
      isEmpty: () => false,
      resize: mocks.resize,
      toPNG: mocks.toPNG,
    })),
  },
}))

vi.mock('../native-common', () => ({
  parseJsonOutput: (stdout: string) => JSON.parse(stdout),
  runPowerShell: mocks.runPowerShell,
}))

import { extractOcrElements } from './ocr'

describe('extractOcrElements', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resize.mockReturnValue({ toPNG: mocks.toPNG })
  })

  it('scales OCR bounds back into screenshot coordinates and deletes its temporary image', async () => {
    mocks.runPowerShell.mockResolvedValue({
      stdout: JSON.stringify({ text: 'Punjabi', x: 40, y: 60, width: 80, height: 20 }),
    })

    const result = await extractOcrElements(Buffer.from('source').toString('base64'), 1_000, 500)

    expect(mocks.resize).toHaveBeenCalledWith({ width: 2_000, height: 1_000 })
    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/zura-ocr-.*\.png$/),
      expect.any(Buffer),
      { flag: 'wx' }
    )
    expect(result).toEqual({
      status: 'available',
      elements: [
        {
          element_id: expect.stringMatching(/^ocr_[a-f0-9]{20}$/),
          source: 'ocr',
          background_safe: false,
          role: 'Text',
          text: 'Punjabi',
          bounds: { x: 20, y: 30, width: 40, height: 10 },
        },
      ],
    })
    expect(mocks.unlink).toHaveBeenCalledOnce()
  })

  it('surfaces OCR failure without leaking the temporary image', async () => {
    mocks.runPowerShell.mockRejectedValue(new Error('OCR runtime unavailable'))

    await expect(
      extractOcrElements(Buffer.from('source').toString('base64'), 100, 100)
    ).resolves.toEqual({
      status: 'unavailable',
      error: 'OCR runtime unavailable',
      elements: [],
    })
    expect(mocks.unlink).toHaveBeenCalledOnce()
  })
})

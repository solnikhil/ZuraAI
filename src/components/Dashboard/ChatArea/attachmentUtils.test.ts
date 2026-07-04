import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/modelUtils', () => ({
  getCapabilitiesFromModel: () => ['vision'],
}))

vi.mock('@/providers', () => ({
  DEFAULT_ATTACHMENT_MAX_SIZE_BYTES: 20 * 1024 * 1024,
  getProviderModels: () => [],
  providerSupportsVisionUploads: () => true,
}))

import {
  buildProviderMessages,
  isTextExtractableAttachment,
  type AttachedFile,
} from './attachmentUtils'

function makeTextDataUrl(content: string, mimeType = 'text/plain') {
  return `data:${mimeType};base64,${btoa(content)}`
}

function makeFile(overrides: Partial<AttachedFile> = {}): AttachedFile {
  return {
    id: 'file-1',
    name: 'notes.txt',
    type: 'file',
    size: 12,
    data: makeTextDataUrl('hello from file'),
    mimeType: 'text/plain',
    ...overrides,
  }
}

describe('attachmentUtils', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('inlines text attachments for OpenAI-compatible providers', () => {
    const messages = buildProviderMessages(
      [
        {
          role: 'user',
          content: 'Summarize this',
          files: [makeFile()],
        },
      ],
      'openrouter'
    )

    expect(messages).toEqual([
      {
        role: 'user',
        content: expect.stringContaining('Attached file contents:'),
      },
    ])
    expect(messages[0].content).toEqual(expect.stringContaining('Attached file: notes.txt'))
    expect(messages[0].content).toEqual(expect.stringContaining('hello from file'))
  })

  it('combines text attachments with image parts when a message contains both', () => {
    const messages = buildProviderMessages(
      [
        {
          role: 'user',
          content: 'Analyze both',
          files: [
            makeFile(),
            {
              id: 'img-1',
              name: 'photo.png',
              type: 'image',
              size: 24,
              data: 'data:image/png;base64,abc',
              mimeType: 'image/png',
            },
          ],
        },
      ],
      'groq'
    )

    expect(Array.isArray(messages[0].content)).toBe(true)
    const parts = messages[0].content as Array<{
      type: string
      text?: string
      image_url?: { url: string }
    }>
    expect(parts[0]).toEqual(
      expect.objectContaining({
        type: 'text',
        text: expect.stringContaining('Attached file: notes.txt'),
      })
    )
    expect(parts[1]).toEqual({
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,abc' },
    })
  })

  it('inlines text attachments for Ollama while still passing image payloads separately', () => {
    const messages = buildProviderMessages(
      [
        {
          role: 'user',
          content: 'Check this',
          files: [
            makeFile(),
            {
              id: 'img-1',
              name: 'photo.png',
              type: 'image',
              size: 24,
              data: 'data:image/png;base64,abc',
              mimeType: 'image/png',
            },
          ],
        },
      ],
      'ollama'
    )

    expect(messages[0]).toEqual(
      expect.objectContaining({
        role: 'user',
        content: expect.stringContaining('Attached file: notes.txt'),
        images: ['abc'],
      })
    )
  })

  it('only marks text-like documents as extractable', () => {
    expect(isTextExtractableAttachment(makeFile())).toBe(true)
    expect(
      isTextExtractableAttachment(
        makeFile({
          name: 'report.pdf',
          mimeType: 'application/pdf',
        })
      )
    ).toBe(false)
  })
})

import React from 'react'
import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  ComposerDraftProvider,
  useComposerDraft,
  type IncomingFilesHandler,
} from './ComposerDraftContext'

function Consumer({ onReady }: { onReady: (api: ReturnType<typeof useComposerDraft>) => void }) {
  const api = useComposerDraft()
  React.useEffect(() => {
    onReady(api)
  }, [api, onReady])
  return <div>ready</div>
}

describe('ComposerDraftContext incoming files', () => {
  it('delivers files immediately when a handler is registered', () => {
    let api: ReturnType<typeof useComposerDraft> | null = null
    const handler = vi.fn()

    render(
      <ComposerDraftProvider>
        <Consumer
          onReady={(value) => {
            api = value
          }}
        />
      </ComposerDraftProvider>
    )

    expect(screen.getByText('ready')).toBeInTheDocument()

    let unsubscribe: (() => void) | undefined
    act(() => {
      unsubscribe = api!.registerIncomingFilesHandler(handler)
      api!.deliverIncomingFiles([new File(['a'], 'a.txt', { type: 'text/plain' })])
    })

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0][0].name).toBe('a.txt')

    act(() => {
      unsubscribe?.()
    })
  })

  it('queues files until a handler registers, then drains', () => {
    let api: ReturnType<typeof useComposerDraft> | null = null
    const handler = vi.fn() as IncomingFilesHandler

    render(
      <ComposerDraftProvider>
        <Consumer
          onReady={(value) => {
            api = value
          }}
        />
      </ComposerDraftProvider>
    )

    act(() => {
      api!.deliverIncomingFiles([
        new File(['one'], 'one.txt', { type: 'text/plain' }),
        new File(['two'], 'two.txt', { type: 'text/plain' }),
      ])
    })

    expect(handler).not.toHaveBeenCalled()

    act(() => {
      api!.registerIncomingFilesHandler(handler)
    })

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0].map((file: File) => file.name)).toEqual(['one.txt', 'two.txt'])
  })
})

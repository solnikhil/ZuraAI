import { act, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ComposerDraftProvider, useComposerDraft } from './ComposerDraftContext'
import { StreamingProvider, useStreaming } from './StreamingContext'

type StreamingApi = ReturnType<typeof useStreaming>
type DraftApi = ReturnType<typeof useComposerDraft>

function Probe({ onReady }: { onReady: (streaming: StreamingApi, draft: DraftApi) => void }) {
  onReady(useStreaming(), useComposerDraft())
  return null
}

describe('StreamingContext composer race', () => {
  it('completes with the latest tokens when the draft changes between updates', () => {
    let streamingApi: StreamingApi | null = null
    let draftApi: DraftApi | null = null

    render(
      <StreamingProvider>
        <ComposerDraftProvider>
          <Probe
            onReady={(streaming, draft) => {
              streamingApi = streaming
              draftApi = draft
            }}
          />
        </ComposerDraftProvider>
      </StreamingProvider>
    )

    let completedContent = ''
    act(() => {
      streamingApi!.startStreaming('session-1', 'message-1')
      streamingApi!.updateStreaming({ content: 'Every streamed' })
      draftApi!.setDraftText('editing while streaming')
      streamingApi!.updateStreaming({ content: 'Every streamed word remains' })
      completedContent = streamingApi!.completeStreaming().content
    })

    expect(completedContent).toBe('Every streamed word remains')
  })
})

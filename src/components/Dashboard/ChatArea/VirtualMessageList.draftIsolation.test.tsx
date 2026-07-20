import React, { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Message } from '../../../chat/types'

const mocks = vi.hoisted(() => ({ viewportRenders: vi.fn() }))

vi.mock('react-virtuoso', () => ({
  Virtuoso: ({
    data,
    itemContent,
  }: {
    data: Message[]
    itemContent: (index: number, message: Message) => React.ReactNode
  }) => {
    mocks.viewportRenders()
    return <div>{data.map((message, index) => itemContent(index, message))}</div>
  },
}))

import { VirtualMessageList } from './VirtualMessageList'

const messages: Message[] = [
  { id: 'user-1', role: 'user', content: 'Question', timestamp: 1 },
  { id: 'assistant-1', role: 'assistant', content: 'Every streamed word remains', timestamp: 2 },
]

const renderMessage = (_index: number, message: Message) => <span>{message.content}</span>

function Harness() {
  const [draft, setDraft] = useState('')
  const [streamingContent, setStreamingContent] = useState('Every streamed word remains')

  return (
    <>
      <input aria-label="Draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
      <button type="button" onClick={() => setStreamingContent(`${streamingContent} intact`)}>
        Stream token
      </button>
      <VirtualMessageList
        messages={messages}
        sessionId="session-1"
        isGenerating
        streamingContent={streamingContent}
        renderMessage={renderMessage}
      />
    </>
  )
}

describe('VirtualMessageList draft isolation', () => {
  it('does not reconcile the message viewport for composer-only edits during streaming', () => {
    mocks.viewportRenders.mockClear()
    render(<Harness />)

    expect(mocks.viewportRenders).toHaveBeenCalledTimes(1)
    fireEvent.change(screen.getByRole('textbox', { name: 'Draft' }), {
      target: { value: 'editing while the answer streams' },
    })

    expect(mocks.viewportRenders).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Every streamed word remains')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Stream token' }))
    expect(mocks.viewportRenders).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Every streamed word remains')).toBeInTheDocument()
  })
})

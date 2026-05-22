// @vitest-environment jsdom

import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const viewSpy = vi.fn(() => <div data-testid="panel-view-stub" />)

vi.mock('./ChatDebugPanelView', () => ({
  ChatDebugPanelView: (props: { sessionId: string }) => {
    viewSpy(props as unknown as never)
    return <div data-testid="panel-view-stub" data-session={props.sessionId} />
  },
}))

import { ChatDebugApp } from './ChatDebugApp'

afterEach(() => {
  viewSpy.mockClear()
  window.location.hash = ''
})

describe('ChatDebugApp (route entry)', () => {
  it('parses sessionId from the hash query string and mounts the view', () => {
    window.location.hash = '#/chat-debug?sessionId=session-abc'
    render(<ChatDebugApp />)

    const view = screen.getByTestId('panel-view-stub')
    expect(view.dataset.session).toBe('session-abc')
  })

  it('decodes percent-encoded sessionIds', () => {
    window.location.hash = `#/chat-debug?sessionId=${encodeURIComponent('session/with slash')}`
    render(<ChatDebugApp />)

    const view = screen.getByTestId('panel-view-stub')
    expect(view.dataset.session).toBe('session/with slash')
  })

  it('shows a friendly fallback when sessionId is missing', () => {
    window.location.hash = '#/chat-debug'
    render(<ChatDebugApp />)

    expect(screen.queryByTestId('panel-view-stub')).not.toBeInTheDocument()
    const fallback = document.querySelector('.chat-debug-page--missing')
    expect(fallback).not.toBeNull()
    expect(fallback?.textContent).toMatch(/No\s+sessionId\s+was\s+provided/i)
  })
})

import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it, vi } from 'vitest'

import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from './message-scroller'

describe('MessageScroller', () => {
  it('scrolls the registered viewport to the end from the floating button', () => {
    const { container } = render(
      <MessageScrollerProvider autoScroll defaultScrollPosition="start">
        <MessageScroller>
          <MessageScrollerViewport data-testid="viewport">
            <MessageScrollerContent>
              <MessageScrollerItem messageId="one">One</MessageScrollerItem>
              <MessageScrollerItem messageId="two">Two</MessageScrollerItem>
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>
    )

    const viewport = screen.getByTestId('viewport') as HTMLDivElement
    Object.defineProperty(viewport, 'scrollHeight', { configurable: true, value: 720 })
    Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 240 })
    viewport.scrollTop = 0
    viewport.scrollTo = vi.fn(({ top }: ScrollToOptions) => {
      viewport.scrollTop = Number(top)
    })

    fireEvent.click(container.querySelector('[data-slot="message-scroller-button"]')!)

    expect(viewport.scrollTo).toHaveBeenCalledWith({ top: 720, behavior: 'smooth' })
    expect(viewport.scrollTop).toBe(720)
  })
})

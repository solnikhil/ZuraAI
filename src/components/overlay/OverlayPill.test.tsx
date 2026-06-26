import { fireEvent, render } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { OverlayPill } from './OverlayPill'

const overlayCss = readFileSync(resolve('src/components/overlay/overlay.css'), 'utf8')

function renderPill(overrides: Partial<React.ComponentProps<typeof OverlayPill>> = {}) {
  const props: React.ComponentProps<typeof OverlayPill> = {
    value: '',
    onChange: vi.fn(),
    onSubmit: vi.fn(),
    onStop: vi.fn(),
    onEscape: vi.fn(),
    isLoading: false,
    inputRef: createRef<HTMLTextAreaElement>(),
    ...overrides,
  }
  return { props, ...render(<OverlayPill {...props} />) }
}

describe('OverlayPill', () => {
  it('shows the mic affordance when idle and empty', () => {
    const { container } = renderPill({ value: '' })
    expect(container.querySelector('.zo-spinner')).toBeNull()
    expect(container.querySelector('.zo-pill__action')?.getAttribute('data-variant')).toBe('mic')
  })

  it('swaps to a spinner while loading', () => {
    const { container } = renderPill({ isLoading: true })
    expect(container.querySelector('.zo-spinner')).not.toBeNull()
    expect(container.querySelector('.zo-pill__action')?.getAttribute('data-variant')).toBe('stop')
  })

  it('shows the send affordance when there is text', () => {
    const { container } = renderPill({ value: 'hello' })
    expect(container.querySelector('.zo-pill__action')?.getAttribute('data-variant')).toBe('send')
  })

  it('submits on Enter (without shift)', () => {
    const onSubmit = vi.fn()
    const { container } = renderPill({ value: 'hi', onSubmit })
    const textarea = container.querySelector('textarea')!
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('does not submit on Shift+Enter', () => {
    const onSubmit = vi.fn()
    const { container } = renderPill({ value: 'hi', onSubmit })
    const textarea = container.querySelector('textarea')!
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('hides the overlay on Escape', () => {
    const onEscape = vi.fn()
    const { container } = renderPill({ onEscape })
    const textarea = container.querySelector('textarea')!
    fireEvent.keyDown(textarea, { key: 'Escape' })
    expect(onEscape).toHaveBeenCalledTimes(1)
  })

  it('styles interactive pill controls as no-drag for frameless windows', () => {
    const { container } = renderPill({ value: 'hello' })
    expect(container.querySelector('.zo-pill')).not.toBeNull()
    expect(container.querySelector('.zo-pill__input')).not.toBeNull()
    expect(container.querySelector('.zo-pill__action')).not.toBeNull()
    expect(overlayCss).toMatch(/\.zo-pill[\s\S]*?-webkit-app-region:\s*no-drag/)
    expect(overlayCss).toMatch(/\.zo-pill__input[\s\S]*?-webkit-app-region:\s*no-drag/)
    expect(overlayCss).toMatch(/\.zo-pill__action[\s\S]*?-webkit-app-region:\s*no-drag/)
  })
})

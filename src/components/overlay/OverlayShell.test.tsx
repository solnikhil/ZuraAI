import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { OverlayShell } from './OverlayShell'

describe('OverlayShell', () => {
  it('omits is-expanded in the idle state', () => {
    const { container } = render(<OverlayShell isExpanded={false}>content</OverlayShell>)
    const shell = container.querySelector('.zo-shell')
    expect(shell).not.toBeNull()
    expect(shell?.classList.contains('is-expanded')).toBe(false)
  })

  it('adds is-expanded when expanded', () => {
    const { container } = render(<OverlayShell isExpanded>content</OverlayShell>)
    const shell = container.querySelector('.zo-shell')
    expect(shell?.classList.contains('is-expanded')).toBe(true)
  })
})

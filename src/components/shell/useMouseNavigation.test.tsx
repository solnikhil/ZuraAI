import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { useMouseNavigation } from './useMouseNavigation'

const mockAppShell = {
  canGoBack: true,
  canGoForward: true,
  goBack: vi.fn(),
  goForward: vi.fn(),
}

vi.mock('../../contexts/AppShellContext', () => ({
  useAppShell: () => mockAppShell,
}))

function Probe() {
  useMouseNavigation()
  return <input aria-label="editor" />
}

describe('useMouseNavigation', () => {
  beforeEach(() => {
    mockAppShell.canGoBack = true
    mockAppShell.canGoForward = true
    mockAppShell.goBack.mockReset()
    mockAppShell.goForward.mockReset()
  })

  it('uses mouse button 3 for shell back navigation', () => {
    render(<Probe />)

    window.dispatchEvent(new MouseEvent('mouseup', { button: 3, bubbles: true }))

    expect(mockAppShell.goBack).toHaveBeenCalledTimes(1)
    expect(mockAppShell.goForward).not.toHaveBeenCalled()
  })

  it('uses mouse button 4 for shell forward navigation', () => {
    render(<Probe />)

    window.dispatchEvent(new MouseEvent('mouseup', { button: 4, bubbles: true }))

    expect(mockAppShell.goForward).toHaveBeenCalledTimes(1)
    expect(mockAppShell.goBack).not.toHaveBeenCalled()
  })

  it('does nothing when navigation is unavailable', () => {
    mockAppShell.canGoBack = false
    mockAppShell.canGoForward = false

    render(<Probe />)

    window.dispatchEvent(new MouseEvent('mouseup', { button: 3, bubbles: true }))
    window.dispatchEvent(new MouseEvent('mouseup', { button: 4, bubbles: true }))

    expect(mockAppShell.goBack).not.toHaveBeenCalled()
    expect(mockAppShell.goForward).not.toHaveBeenCalled()
  })

  it('ignores side-button events fired from editable targets', () => {
    const { getByLabelText } = render(<Probe />)

    getByLabelText('editor').dispatchEvent(new MouseEvent('mouseup', { button: 3, bubbles: true }))

    expect(mockAppShell.goBack).not.toHaveBeenCalled()
  })
})

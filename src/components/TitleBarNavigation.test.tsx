import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import TitleBarNavigation from './TitleBarNavigation'

describe('TitleBarNavigation', () => {
  it('calls the back and forward handlers', () => {
    const onBack = vi.fn()
    const onForward = vi.fn()

    render(<TitleBarNavigation canGoBack canGoForward onBack={onBack} onForward={onForward} />)

    fireEvent.click(screen.getByLabelText('Go back'))
    fireEvent.click(screen.getByLabelText('Go forward'))

    expect(onBack).toHaveBeenCalledTimes(1)
    expect(onForward).toHaveBeenCalledTimes(1)
  })

  it('disables the controls at history boundaries', () => {
    render(
      <TitleBarNavigation
        canGoBack={false}
        canGoForward={false}
        onBack={vi.fn()}
        onForward={vi.fn()}
      />
    )

    expect(screen.getByLabelText('Go back')).toBeDisabled()
    expect(screen.getByLabelText('Go forward')).toBeDisabled()
  })
})

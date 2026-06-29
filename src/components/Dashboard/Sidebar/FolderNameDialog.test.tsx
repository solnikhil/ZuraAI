import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import FolderNameDialog from './FolderNameDialog'

describe('FolderNameDialog', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens folder settings from the gear button', () => {
    render(
      <FolderNameDialog
        open={true}
        mode="create"
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.queryByText('Choose memory access')).not.toBeInTheDocument()

    fireEvent.pointerDown(screen.getByRole('button', { name: /folder settings/i }))

    expect(screen.getByText('Choose memory access')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /folder settings/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
  })

  it('opens folder settings from keyboard activation', () => {
    render(
      <FolderNameDialog
        open={true}
        mode="create"
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    fireEvent.keyDown(screen.getByRole('button', { name: /folder settings/i }), {
      key: 'Enter',
    })

    expect(screen.getByText('Choose memory access')).toBeInTheDocument()
  })

  it('animates folder settings out before unmounting', () => {
    vi.useFakeTimers()

    render(
      <FolderNameDialog
        open={true}
        mode="create"
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    const trigger = screen.getByRole('button', { name: /folder settings/i })
    fireEvent.pointerDown(trigger)

    const dropdown = screen.getByRole('dialog', { name: /folder settings/i })
    expect(dropdown).toHaveAttribute('data-state', 'open')

    fireEvent.pointerDown(trigger)

    expect(screen.getByRole('dialog', { name: /folder settings/i })).toHaveAttribute(
      'data-state',
      'closed'
    )

    act(() => {
      vi.advanceTimersByTime(120)
    })

    expect(screen.queryByRole('dialog', { name: /folder settings/i })).not.toBeInTheDocument()
  })

  it('closes folder settings when clicking elsewhere in the folder dialog', () => {
    vi.useFakeTimers()

    render(
      <FolderNameDialog
        open={true}
        mode="create"
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    fireEvent.pointerDown(screen.getByRole('button', { name: /folder settings/i }))
    expect(screen.getByRole('dialog', { name: /folder settings/i })).toHaveAttribute(
      'data-state',
      'open'
    )

    fireEvent.pointerDown(screen.getByText('New folder'))

    expect(screen.getByRole('dialog', { name: /folder settings/i })).toHaveAttribute(
      'data-state',
      'closed'
    )

    act(() => {
      vi.advanceTimersByTime(120)
    })

    expect(screen.queryByRole('dialog', { name: /folder settings/i })).not.toBeInTheDocument()
  })
})

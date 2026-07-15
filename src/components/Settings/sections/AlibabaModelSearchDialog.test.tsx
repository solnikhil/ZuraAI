import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AlibabaModelSearchDialog } from './AlibabaModelSearchDialog'

describe('AlibabaModelSearchDialog', () => {
  it('loads its curated catalog without a credential or network request', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
    render(
      <AlibabaModelSearchDialog
        open
        onOpenChange={vi.fn()}
        onAddModel={vi.fn()}
      />
    )

    await screen.findByText('Qwen3.7-Max')
    expect(fetchSpy).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /refresh/i }))
    await waitFor(() => expect(screen.getByText('Qwen3.7-Max')).toBeInTheDocument())
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

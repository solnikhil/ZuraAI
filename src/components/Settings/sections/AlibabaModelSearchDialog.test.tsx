import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AlibabaModelSearchDialog } from './AlibabaModelSearchDialog'

function createAlibabaCatalogHtml(modelId = 'qwen3-max', name = 'Qwen3-Max'): string {
  const payload = JSON.stringify([
    '$',
    '$L22',
    null,
    {
      data: {
        '0': [
          {
            modelId,
            name,
            feature: 'Qwen3,Text Generation',
            description: 'Frontier reasoning, 1M context, agentic workflow mastery',
            modelType: 'Flagship',
            launchDate: '2026-01-23',
            order: '1.000000000',
          },
        ],
      },
    },
  ])

  const encodedPayload = payload.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
  return `<html><body><script>self.__next_f.push([1,"12:${encodedPayload}"])</script></body></html>`
}

describe('AlibabaModelSearchDialog', () => {
  it('refreshes the catalog on open and via the manual refresh button', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue({
        ok: true,
        text: async () => createAlibabaCatalogHtml(),
      } as Response)

    const onAddModel = vi.fn()
    const onOpenChange = vi.fn()
    const { rerender } = render(
      <AlibabaModelSearchDialog
        open={false}
        onOpenChange={onOpenChange}
        onAddModel={onAddModel}
        apiKey="ali-key"
      />
    )

    rerender(
      <AlibabaModelSearchDialog
        open
        onOpenChange={onOpenChange}
        onAddModel={onAddModel}
        apiKey="ali-key"
      />
    )

    await screen.findByText('Qwen3-Max')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /refresh/i }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    rerender(
      <AlibabaModelSearchDialog
        open={false}
        onOpenChange={onOpenChange}
        onAddModel={onAddModel}
        apiKey="ali-key"
      />
    )
    rerender(
      <AlibabaModelSearchDialog
        open
        onOpenChange={onOpenChange}
        onAddModel={onAddModel}
        apiKey="ali-key"
      />
    )

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
  })
})

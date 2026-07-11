import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ActionsMenu } from './actions-menu'

describe('ActionsMenu', () => {
  it('renders groups and invokes onSelect', async () => {
    const onSelect = vi.fn()
    render(
      <ActionsMenu
        open
        onOpenChange={() => undefined}
        trigger={<button type="button">Open menu</button>}
        groups={[
          {
            id: 'main',
            label: 'Actions',
            items: [
              { id: 'one', label: 'Do thing', onSelect },
              { id: 'two', label: 'Other', disabled: true },
            ],
          },
        ]}
      />
    )

    expect(screen.getByText('Actions')).toBeTruthy()
    fireEvent.click(screen.getByText('Do thing'))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('filters items when filterable', () => {
    render(
      <ActionsMenu
        open
        onOpenChange={() => undefined}
        filterable
        filterPlaceholder="Filter"
        trigger={<button type="button">Open menu</button>}
        groups={[
          {
            id: 'repos',
            label: 'Recent',
            items: [
              { id: 'a', label: 'ZuraAI', description: 'solnikhil/ZuraAI' },
              { id: 'b', label: 'Other', description: 'someone/other' },
            ],
          },
        ]}
      />
    )

    fireEvent.change(screen.getByLabelText('Filter'), { target: { value: 'zura' } })
    expect(screen.getByText('ZuraAI')).toBeTruthy()
    expect(screen.queryByText('Other')).toBeNull()
  })
})

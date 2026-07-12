import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { defaultSettings } from '../../../contexts/settingsStore'
import { CommandBarSection } from './CommandBarSection'

vi.mock('../../../utils/platform', () => ({
  isWindowsRuntime: () => true,
}))

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/ui/select', () => {
  const SelectContext = React.createContext<((value: string) => void) | undefined>(undefined)

  return {
    Select: ({
      children,
      onValueChange,
    }: {
      children: React.ReactNode
      onValueChange?: (value: string) => void
    }) => <SelectContext.Provider value={onValueChange}>{children}</SelectContext.Provider>,
    SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({ children, value }: { children: React.ReactNode; value?: string }) => {
      const onValueChange = React.useContext(SelectContext)
      return (
        <button type="button" onClick={() => value && onValueChange?.(value)}>
          {children}
        </button>
      )
    },
    SelectTrigger: ({ children, ...props }: React.ComponentProps<'button'>) => (
      <button {...props}>{children}</button>
    ),
    SelectValue: () => null,
  }
})

vi.mock('@/components/ui/switch', () => ({
  Switch: ({
    checked,
    onCheckedChange,
    ...props
  }: {
    checked?: boolean
    onCheckedChange?: (checked: boolean) => void
  } & React.ComponentProps<'button'>) => (
    <button
      type="button"
      aria-checked={checked}
      onClick={() => onCheckedChange?.(!checked)}
      {...props}
    />
  ),
}))

describe('CommandBarSection', () => {
  const getIndex = vi.fn(async () => ({
    workflows: [],
    apps: [{ id: 'app:kiro', type: 'app', title: 'Kiro' }],
    windows: [],
    actions: [],
    chats: [],
    diagnostics: {
      apps: {
        ok: true,
        stale: false,
        sourceCounts: { 'start-menu': 12, 'windows-search': 40 },
        lastRefreshAt: Date.now(),
        refreshDurationMs: 120,
      },
    },
  }))
  const refreshAppIndex = vi.fn(async () => ({
    ok: true,
    stale: false,
    sourceCounts: { 'start-menu': 12, 'windows-search': 40 },
    lastRefreshAt: Date.now(),
    refreshDurationMs: 88,
  }))
  const searchNativeIndex = vi.fn(async () => ({
    files: [],
    diagnostics: {
      ok: false,
      available: false,
      error: 'Windows Search indexing is disabled or stopped.',
    },
  }))
  const setExtensionEnabled = vi.fn(async () => ({
    enabled: true,
    shortcut: 'Control+Shift+Space',
    shortcutRegistered: true,
  }))
  const show = vi.fn(async () => true)

  beforeEach(() => {
    getIndex.mockClear()
    refreshAppIndex.mockClear()
    searchNativeIndex.mockClear()
    setExtensionEnabled.mockClear()
    show.mockClear()
    Object.assign(window, {
      commandCenter: {
        getIndex,
        refreshAppIndex,
        searchNativeIndex,
        setExtensionEnabled,
        show,
      },
    })
  })

  it('loads app index diagnostics and supports manual reindex', async () => {
    render(<CommandBarSection settings={defaultSettings} onChange={vi.fn()} />)

    expect(screen.getByText('Command Bar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reindex Command Center apps/i })).toBeInTheDocument()

    await waitFor(() => {
      expect(getIndex).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(screen.getByText(/Sources: start-menu: 12/i)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Reindex Command Center apps/i }))

    await waitFor(() => {
      expect(refreshAppIndex).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(screen.getByText(/App index refreshed/i)).toBeInTheDocument()
    })
  })

  it('shows Windows Search diagnostic when unavailable', async () => {
    render(<CommandBarSection settings={defaultSettings} onChange={vi.fn()} />)

    await waitFor(() => {
      expect(
        screen.getByText(/Windows Search indexing is disabled or stopped/i)
      ).toBeInTheDocument()
    })
  })

  it('emits palette preference changes', () => {
    const onChange = vi.fn()
    render(<CommandBarSection settings={defaultSettings} onChange={onChange} />)

    fireEvent.click(screen.getByLabelText('Show recent commands in command palette'))
    expect(onChange).toHaveBeenCalled()
    const payload = onChange.mock.calls[0]?.[0]
    expect(payload).toHaveProperty('commandBar')
  })

  it('emits palette size preference changes', () => {
    const onChange = vi.fn()
    render(<CommandBarSection settings={defaultSettings} onChange={onChange} />)

    const trigger = screen.getByLabelText('Command palette UI size')
    expect(trigger).toBeInTheDocument()

    fireEvent.click(trigger)
    const largeOption = screen.getByRole('button', { name: 'Larger' })
    fireEvent.click(largeOption)

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        commandBar: expect.objectContaining({
          size: 'large',
        }),
      })
    )
  })
})

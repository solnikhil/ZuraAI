import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import AppContextMenu from './AppContextMenu'

const platformMocks = vi.hoisted(() => ({
  isMacOSRuntime: vi.fn(() => false),
}))

vi.mock('../utils/platform', () => ({
  isMacOSRuntime: platformMocks.isMacOSRuntime,
}))

vi.mock('@/components/ui/context-menu', () => ({
  ContextMenu: ({ children }: { children: React.ReactNode }) => <div data-testid="context-menu-root">{children}</div>,
  ContextMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ContextMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ContextMenuGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ContextMenuItem: ({ children, onSelect }: { children: React.ReactNode; onSelect?: () => void }) => (
    <button type="button" onClick={onSelect}>
      {children}
    </button>
  ),
  ContextMenuSeparator: () => <hr />,
  ContextMenuShortcut: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

describe('AppContextMenu', () => {
  beforeEach(() => {
    platformMocks.isMacOSRuntime.mockReset()
    platformMocks.isMacOSRuntime.mockReturnValue(false)
    window.contextMenu = {
      show: vi.fn().mockResolvedValue(undefined),
      onAction: vi.fn(() => vi.fn()),
    }
    window.shell = {
      openExternal: vi.fn(),
      readClipboardText: vi.fn().mockResolvedValue(''),
    }
    window.devTools = {
      inspectElement: vi.fn(),
    }
  })

  it('uses the native context-menu bridge on macOS', () => {
    platformMocks.isMacOSRuntime.mockReturnValue(true)

    render(
      <AppContextMenu>
        <div>Child</div>
      </AppContextMenu>
    )

    fireEvent.contextMenu(screen.getByText('Child'), { clientX: 14, clientY: 18 })

    expect(window.contextMenu.show).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Select All')).not.toBeInTheDocument()
  })

  it('keeps the renderer context menu available off macOS', () => {
    render(
      <AppContextMenu>
        <div>Child</div>
      </AppContextMenu>
    )

    expect(window.contextMenu.show).not.toHaveBeenCalled()
    expect(screen.getByText('Select All')).toBeInTheDocument()
  })
})

import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from './context-menu'
import { Menubar, MenubarContent, MenubarItem, MenubarMenu, MenubarTrigger } from './menubar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select'

describe('menu primitives', () => {
  it('uses the shared dropdown menu classes', () => {
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Item</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )

    expect(screen.getByRole('menu')).toHaveClass('zura-menu-surface')
    expect(screen.getByRole('menuitem')).toHaveClass('zura-menu-item')
  })

  it('uses the shared select classes', () => {
    const { container } = render(
      <Select open value="one" onValueChange={() => {}}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="one">One</SelectItem>
        </SelectContent>
      </Select>
    )

    expect(container.querySelector('[data-slot="select-trigger"]')).toHaveClass('zura-menu-trigger')
    expect(screen.getByRole('option')).toHaveClass('zura-menu-item')
  })

  it('uses compact classes for context menus', () => {
    render(
      <ContextMenu>
        <ContextMenuTrigger>Target</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem>Copy</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    )
    fireEvent.contextMenu(screen.getByText('Target'))

    expect(screen.getByRole('menu')).toHaveClass('zura-menu-surface--compact')
    expect(screen.getByRole('menuitem')).toHaveClass('zura-menu-item--compact')
  })

  it('uses compact classes for menubar menus', () => {
    render(
      <Menubar>
        <MenubarMenu>
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>New Chat</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
    )
    expect(screen.getByRole('menuitem', { name: 'File' })).not.toHaveClass('zura-menu-trigger')
    expect(screen.getByRole('menuitem', { name: 'File' })).toHaveClass('bg-transparent')
  })
})

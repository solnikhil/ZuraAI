import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CommandBarSection } from './CommandBarSection'
import type { Settings } from '../../../contexts/SettingsContext'

describe('CommandBarSection', () => {
  const baseCommandBar: Settings['commandBar'] = {
    enabled: false,
    size: 'medium',
    fieldSurface: 60,
    fieldSurfaceFocused: 70,
    dropdownSurface: 70,
    enableBlur: true,
    blurPx: 10,
    maxSuggestions: 7,
    showRecents: true,
    maxRecents: 2,
    enableTabAutocomplete: false,
  }

  it('calls onChange when enabling command bar', () => {
    const onChange = vi.fn()
    render(
      <CommandBarSection
        commandBar={baseCommandBar}
        onChange={onChange}
      />
    )

    const switchEl = screen.getByRole('switch', { name: /enable command bar/i })
    fireEvent.click(switchEl)

    expect(onChange).toHaveBeenCalledWith({ enabled: true })
  })

  it('calls onChange when toggling recent commands', () => {
    const onChange = vi.fn()
    render(
      <CommandBarSection
        commandBar={baseCommandBar}
        onChange={onChange}
      />
    )

    const switchEl = screen.getByRole('switch', { name: /show recent commands/i })
    fireEvent.click(switchEl)

    expect(onChange).toHaveBeenCalledWith({ showRecents: false })
  })

  it('calls onRememberChange when toggling remember checkboxes', () => {
    const onRememberChange = vi.fn()
    render(
      <CommandBarSection
        commandBar={baseCommandBar}
        onChange={vi.fn()}
        rememberLastChatSession={true}
        rememberLastDashboardView={true}
        rememberLastSettingsSection={true}
        onRememberChange={onRememberChange}
      />
    )

    fireEvent.click(screen.getByLabelText('Chat session'))
    expect(onRememberChange).toHaveBeenCalledWith({ rememberLastChatSession: false })

    fireEvent.click(screen.getByLabelText('Chat/Settings view'))
    expect(onRememberChange).toHaveBeenCalledWith({ rememberLastDashboardView: false })

    fireEvent.click(screen.getByLabelText('Settings section'))
    expect(onRememberChange).toHaveBeenCalledWith({ rememberLastSettingsSection: false })
  })
})

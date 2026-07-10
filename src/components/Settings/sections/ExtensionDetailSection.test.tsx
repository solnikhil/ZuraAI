import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { defaultSkillsSettings } from '@/skills'
import { ExtensionDetailSection } from './ExtensionDetailSection'

describe('ExtensionDetailSection', () => {
  const setExtensionEnabled = vi.fn(async () => ({
    enabled: true,
    shortcut: 'CommandOrControl+Shift+Space',
    shortcutRegistered: true,
  }))
  const show = vi.fn(async () => true)

  beforeEach(() => {
    setExtensionEnabled.mockClear()
    show.mockClear()
    Object.assign(window, {
      commandCenter: {
        setExtensionEnabled,
        show,
      },
    })
  })

  it('renders Command Center shortcut and opens the overlay when enabled', async () => {
    render(
      <ExtensionDetailSection
        extensionId="command_center"
        skills={{
          ...defaultSkillsSettings,
          command_center: { enabled: true },
        }}
        codeExecutionAutoApprove={false}
        terminalAutoApprove={false}
        computerUseAutoApprove={false}
        isEnabled={(extensionId) => extensionId === 'command_center'}
        setEnabled={vi.fn()}
        onChange={vi.fn()}
      />
    )

    expect(screen.getByText('Global shortcut')).toBeInTheDocument()
    expect(screen.getByText(/Ctrl\+Shift\+Space/)).toBeInTheDocument()
    expect(screen.getByText('Quick OS actions')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /open/i }))
    await waitFor(() => {
      expect(setExtensionEnabled).toHaveBeenCalledWith(true)
      expect(show).toHaveBeenCalledTimes(1)
    })
  })

  it('keeps the Command Center open button available outside Agent Mode', async () => {
    render(
      <ExtensionDetailSection
        extensionId="command_center"
        skills={defaultSkillsSettings}
        codeExecutionAutoApprove={false}
        terminalAutoApprove={false}
        computerUseAutoApprove={false}
        isEnabled={() => false}
        setEnabled={vi.fn()}
        onChange={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /open/i }))
    await waitFor(() => {
      expect(setExtensionEnabled).toHaveBeenCalledWith(true)
      expect(show).toHaveBeenCalledTimes(1)
    })
  })
})

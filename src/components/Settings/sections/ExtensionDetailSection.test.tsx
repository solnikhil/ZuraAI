import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { defaultSkillsSettings } from '@/skills'
import { ExtensionDetailSection } from './ExtensionDetailSection'

describe('ExtensionDetailSection', () => {
  beforeEach(() => {
    Object.assign(window, {
      commandCenter: {
        show: vi.fn(async () => true),
      },
    })
  })

  it('renders Command Center shortcut and opens the overlay when enabled', () => {
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
    expect(window.commandCenter.show).toHaveBeenCalledTimes(1)
  })

  it('disables the Command Center open button when the extension is disabled', () => {
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

    expect(screen.getByRole('button', { name: /open/i })).toBeDisabled()
  })
})

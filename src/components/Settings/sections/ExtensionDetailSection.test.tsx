import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultSkillsSettings } from '@/skills'
import { ExtensionDetailSection } from './ExtensionDetailSection'

function renderDetail(extensionId: 'code_execution' | 'terminal' | 'computer_use') {
  return render(
    <ExtensionDetailSection
      extensionId={extensionId}
      skills={defaultSkillsSettings}
      isEnabled={() => true}
      setEnabled={vi.fn()}
      onChange={vi.fn()}
    />
  )
}

describe('ExtensionDetailSection approval settings', () => {
  beforeEach(() => {
    window.agentApproval = {
      requestApproval: vi.fn(),
      getAutonomousMode: vi.fn(async () => ({ enabled: false })),
      setAutonomousMode: vi.fn(async (enabled: boolean) => ({ enabled })),
    }
  })

  it.each(['code_execution', 'terminal'] as const)(
    'does not expose renderer auto-approval for %s',
    (extensionId) => {
      renderDetail(extensionId)
      expect(screen.queryByText(/auto-approve/i)).not.toBeInTheDocument()
      expect(screen.getByText('How it works')).toBeInTheDocument()
    }
  )

  it('offers main-owned fully autonomous mode with explicit safety guidance', async () => {
    renderDetail('computer_use')
    const toggle = await screen.findByRole('switch', { name: 'Fully autonomous mode' })
    fireEvent.click(toggle)
    await waitFor(() => expect(window.agentApproval?.setAutonomousMode).toHaveBeenCalledWith(true))
    expect(screen.getByText(/one native confirmation/i)).toBeInTheDocument()
    expect(screen.getByText('Emergency stop')).toBeInTheDocument()
  })
})

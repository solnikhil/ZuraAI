import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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
  it.each(['code_execution', 'terminal'] as const)(
    'does not expose renderer auto-approval for %s',
    (extensionId) => {
      renderDetail(extensionId)
      expect(screen.queryByText(/auto-approve/i)).not.toBeInTheDocument()
      expect(screen.getByText('How it works')).toBeInTheDocument()
    }
  )

  it('keeps Computer Use safety guidance without an auto-approval toggle', () => {
    renderDetail('computer_use')
    expect(screen.queryByText(/auto-approve/i)).not.toBeInTheDocument()
    expect(screen.getByText('Emergency stop')).toBeInTheDocument()
  })
})

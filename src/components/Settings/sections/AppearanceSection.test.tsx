import React from 'react'
import '@testing-library/jest-dom'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppearanceSection } from './AppearanceSection'
import { defaultSettings } from '../../../contexts/settingsStore'

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children, ...props }: React.ComponentProps<'button'>) => <button {...props}>{children}</button>,
  SelectValue: () => null,
}))

vi.mock('@/components/ui/switch', () => ({
  Switch: (props: React.ComponentProps<'button'>) => <button type="button" {...props} />,
}))

describe('AppearanceSection', () => {
  it('renders a title model selector without a separate title provider control', () => {
    render(
      <AppearanceSection
        settings={{
          ...defaultSettings,
          openRouterApiKey: 'or-key',
          groqApiKey: 'groq-key',
          configuredModels: [
            { code: 'openrouter/meta-llama/llama-3.3', displayName: 'Llama 3.3', enabled: true },
          ],
          groqModels: [{ code: 'groq-primary', displayName: 'Groq Primary', enabled: true }],
        }}
        onChange={vi.fn()}
      />
    )

    expect(screen.getByText('Title model')).toBeInTheDocument()
    expect(
      screen.getByText('Model used for automatic chat titles across all configured providers')
    ).toBeInTheDocument()
    expect(screen.queryByText('Title provider')).not.toBeInTheDocument()
  })
})

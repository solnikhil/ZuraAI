import React from 'react'
import '@testing-library/jest-dom'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AppearanceSection } from './AppearanceSection'
import { defaultSettings } from '../../../contexts/settingsStore'

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
    SelectItem: ({
      children,
      value,
    }: {
      children: React.ReactNode
      value?: string
    }) => {
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

  it('renders the assistant personality selector', () => {
    render(<AppearanceSection settings={defaultSettings} onChange={vi.fn()} />)

    expect(screen.getByText('Assistant personality')).toBeInTheDocument()
    expect(
      screen.getByText('Controls the communication style added to the runtime system prompt')
    ).toBeInTheDocument()
    expect(screen.getByText('Professional Engineer')).toBeInTheDocument()
    expect(screen.getAllByText('Gen Z').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText('Senior Architect')).not.toBeInTheDocument()
  })

  it('emits assistant personality changes', () => {
    const onChange = vi.fn()
    render(<AppearanceSection settings={defaultSettings} onChange={onChange} />)

    const genZButtons = screen.getAllByRole('button', { name: 'Gen Z' })
    fireEvent.click(genZButtons[genZButtons.length - 1])

    expect(onChange).toHaveBeenCalledWith({ assistantPersonality: 'gen-z' })
  })
})

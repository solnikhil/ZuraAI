import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ProviderHubSection } from './ProviderHubSection'

describe('ProviderHubSection', () => {
  const baseProps = {
    openRouterApiKey: '',
    perplexityApiKey: '',
    geminiApiKey: '',
    groqApiKey: '',
    minimaxApiKey: '',
    tavilyApiKey: '',
    ollamaUrl: 'http://localhost:11434',
    toolsEnabled: true,
    webSearchEnabled: true,
    deepResearchEnabled: false,
    aiModel: 'x-ai/grok-4.1-fast',
    modelProvider: 'openrouter' as const,
    configuredModels: [
      { code: 'x-ai/grok-4.1-fast', displayName: 'Grok 4.1 Fast' },
      { code: 'x-ai/grok-4.1-mini', displayName: 'Grok 4.1 Mini' },
      { code: 'openrouter/image-model', displayName: 'ImageGen Pro' },
    ],
    perplexityModels: [{ code: 'sonar', displayName: 'Sonar' }],
    geminiModels: [{ code: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' }],
    groqModels: [{ code: 'llama-3.1-8b-instant', displayName: 'Llama 3.1 8B Instant' }],
    minimaxModels: [{ code: 'MiniMax-M2.1', displayName: 'MiniMax M2.1' }],
    ollamaModels: [{ code: 'qwen3:8b', displayName: 'qwen3:8b' }],
    maxTokens: 8000,
    titleModel: 'gemini-2.5-flash',
    onChange: vi.fn(),
  }

  it('renders providers controls', () => {
    render(<ProviderHubSection {...baseProps} />)

    expect(screen.getByText('Providers')).toBeInTheDocument()
    expect(screen.getByText('Model Providers')).toBeInTheDocument()
    expect(screen.getByText('Search APIs')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search Providers...')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add custom model/i })).toBeInTheDocument()
  })

  it('creates a custom model from add dialog', () => {
    const onChange = vi.fn()
    render(<ProviderHubSection {...baseProps} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: /add custom model/i }))
    expect(screen.getByText('Create Custom AI Model')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText(/please enter the model id/i), { target: { value: 'custom/provider-model-1' } })
    fireEvent.change(screen.getByPlaceholderText(/please enter the display name/i), { target: { value: 'Custom Provider Model 1' } })
    fireEvent.click(screen.getByRole('button', { name: /add model/i }))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      configuredModels: expect.arrayContaining([
        expect.objectContaining({ code: 'custom/provider-model-1', displayName: 'Custom Provider Model 1' }),
      ]),
    }))
  })

  it('opens custom order dialog from group header action', () => {
    render(<ProviderHubSection {...baseProps} />)

    fireEvent.click(screen.getByRole('button', { name: /custom order for enabled providers/i }))
    expect(screen.getByText('Custom Order')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /update/i })).toBeInTheDocument()
  })

  it('updates selected model from provider model row', () => {
    const onChange = vi.fn()
    render(<ProviderHubSection {...baseProps} onChange={onChange} />)

    fireEvent.click(screen.getByText('OpenRouter provides access to many frontier models through one API.'))
    fireEvent.click(screen.getByLabelText('Set current Grok 4.1 Mini'))

    expect(onChange).toHaveBeenCalledWith({
      aiModel: 'x-ai/grok-4.1-mini',
      modelProvider: 'openrouter',
    })
  })

  it('allows enabling multiple models independently', () => {
    const onChange = vi.fn()
    const props = {
      ...baseProps,
      configuredModels: [
        { code: 'x-ai/grok-4.1-fast', displayName: 'Grok 4.1 Fast', enabled: true },
        { code: 'x-ai/grok-4.1-mini', displayName: 'Grok 4.1 Mini', enabled: false },
        { code: 'openrouter/image-model', displayName: 'ImageGen Pro', enabled: false },
      ],
    }

    render(<ProviderHubSection {...props} onChange={onChange} />)

    fireEvent.click(screen.getByText('OpenRouter provides access to many frontier models through one API.'))
    fireEvent.click(screen.getByLabelText('Toggle Grok 4.1 Mini'))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      configuredModels: expect.arrayContaining([
        expect.objectContaining({ code: 'x-ai/grok-4.1-fast', enabled: true }),
        expect.objectContaining({ code: 'x-ai/grok-4.1-mini', enabled: true }),
      ]),
    }))
  })

  it('switches model list between all and chat views', () => {
    render(<ProviderHubSection {...baseProps} />)

    fireEvent.click(screen.getByText('OpenRouter provides access to many frontier models through one API.'))

    expect(screen.getByText(/All \(/)).toBeInTheDocument()
    expect(screen.getByText(/Chat \(/)).toBeInTheDocument()
    expect(screen.getByLabelText('Toggle ImageGen Pro')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Chat \(/ }))
    expect(screen.queryByLabelText('Toggle ImageGen Pro')).not.toBeInTheDocument()
  })
})

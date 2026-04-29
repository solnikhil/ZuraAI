import React from 'react'
import '@testing-library/jest-dom'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ProviderHubSection } from './ProviderHubSection'

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onSelect,
  }: {
    children: React.ReactNode
    onSelect?: (event: { preventDefault: () => void }) => void
  }) => (
    <button
      type="button"
      role="menuitem"
      onClick={() => onSelect?.({ preventDefault: () => undefined })}
    >
      {children}
    </button>
  ),
}))

Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
  value: vi.fn(),
  writable: true,
})

function createAlibabaCatalogHtml(): string {
  const payload = JSON.stringify([
    '$',
    '$L22',
    null,
    {
      data: {
        '0': [
          {
            modelId: 'qwen3-coder-next',
            name: 'Qwen3-Coder-Next',
            feature: 'Qwen3, Agentic Coding',
            description: 'Multi-turn tool interactions, future-ready development support',
            modelType: 'Flagship',
            launchDate: '2026-02-20',
            order: '1.000000000',
          },
        ],
      },
    },
  ])

  const encodedPayload = payload.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
  return `<html><body><script>self.__next_f.push([1,"12:${encodedPayload}"])</script></body></html>`
}

function createPerplexityCatalogPage(
  models: string[] = ['sonar', 'sonar-pro', 'sonar-deep-research', 'sonar-reasoning-pro']
): string {
  return `Body application/json model enum<string> required Available options: ${models.map((model) => `\`${model}\``).join(', ')} messages ChatMessage`
}

describe('ProviderHubSection', () => {
  const openExternal = vi.fn()
  const fetchMock = vi.fn()

  const baseProps = {
    openRouterApiKey: '',
    openRouterDebug: false,
    perplexityApiKey: '',
    groqApiKey: '',
    alibabaApiKey: '',
    fireworksApiKey: '',
    tavilyApiKey: '',
    tavilySearchDepthPreference: 'auto' as const,
    webSearchIncludeImages: true,
    ollamaUrl: 'http://localhost:11434',
    aiModel: 'x-ai/grok-4.1-fast',
    modelProvider: 'openrouter' as const,
    configuredModels: [
      { code: 'x-ai/grok-4.1-fast', displayName: 'Grok 4.1 Fast' },
      { code: 'x-ai/grok-4.1-mini', displayName: 'Grok 4.1 Mini' },
      { code: 'openrouter/image-model', displayName: 'ImageGen Pro' },
    ],
    perplexityModels: [{ code: 'sonar', displayName: 'Sonar' }],
    groqModels: [{ code: 'llama-3.1-8b-instant', displayName: 'Llama 3.1 8B Instant' }],
    alibabaModels: [{ code: 'qwen-plus', displayName: 'Qwen Plus' }],
    fireworksModels: [
      { code: 'accounts/fireworks/models/deepseek-v3p2', displayName: 'DeepSeek V3.2' },
    ],
    ollamaModels: [{ code: 'qwen3:8b', displayName: 'qwen3:8b' }],
    maxTokens: 8000,
    onChange: vi.fn(),
  }

  beforeEach(() => {
    openExternal.mockReset()
    fetchMock.mockReset()
    ;(window as Window & { shell?: { openExternal: typeof openExternal } }).shell = {
      openExternal,
    }
    vi.stubGlobal('fetch', fetchMock)
  })

  it('renders providers controls', () => {
    render(<ProviderHubSection {...baseProps} />)

    expect(screen.getByRole('heading', { name: 'Providers' })).toBeInTheDocument()
    expect(screen.getByText('Model Providers')).toBeInTheDocument()
    expect(screen.getByText('Service APIs')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add custom model/i })).not.toBeInTheDocument()
  })

  it('creates a custom model from add dialog', () => {
    const onChange = vi.fn()
    render(<ProviderHubSection {...baseProps} onChange={onChange} />)

    fireEvent.click(
      screen.getByText('OpenRouter provides access to many frontier models through one API.')
    )
    fireEvent.click(screen.getByRole('button', { name: /add custom model/i }))
    expect(screen.getByText('Create Custom AI Model')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText(/please enter the model id/i), {
      target: { value: 'custom/provider-model-1' },
    })
    fireEvent.change(screen.getByPlaceholderText(/please enter the display name/i), {
      target: { value: 'Custom Provider Model 1' },
    })
    fireEvent.click(screen.getByRole('button', { name: /add model/i }))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        configuredModels: expect.arrayContaining([
          expect.objectContaining({
            code: 'custom/provider-model-1',
            displayName: 'Custom Provider Model 1',
          }),
        ]),
      })
    )
  })

  it('removes current-model selection controls from settings list', () => {
    const onChange = vi.fn()
    render(<ProviderHubSection {...baseProps} onChange={onChange} />)

    fireEvent.click(
      screen.getByText('OpenRouter provides access to many frontier models through one API.')
    )

    expect(screen.queryByLabelText(/Set current/i)).not.toBeInTheDocument()
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

    fireEvent.click(
      screen.getByText('OpenRouter provides access to many frontier models through one API.')
    )
    fireEvent.click(screen.getByLabelText('Toggle Grok 4.1 Mini'))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        configuredModels: expect.arrayContaining([
          expect.objectContaining({ code: 'x-ai/grok-4.1-fast', enabled: true }),
          expect.objectContaining({ code: 'x-ai/grok-4.1-mini', enabled: true }),
        ]),
      })
    )
  })

  it('switches model list between all and chat views', () => {
    render(<ProviderHubSection {...baseProps} />)

    fireEvent.click(
      screen.getByText('OpenRouter provides access to many frontier models through one API.')
    )

    expect(screen.getByText(/All \(/)).toBeInTheDocument()
    expect(screen.getByText(/Chat \(/)).toBeInTheDocument()
    expect(screen.getByLabelText('Toggle ImageGen Pro')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Chat \(/ }))
    expect(screen.queryByLabelText('Toggle ImageGen Pro')).not.toBeInTheDocument()
  })

  it('opens edit dialog when Edit is clicked on a model', () => {
    const onChange = vi.fn()
    render(<ProviderHubSection {...baseProps} onChange={onChange} />)

    fireEvent.click(
      screen.getByText('OpenRouter provides access to many frontier models through one API.')
    )

    const editButtons = screen.getAllByRole('button', { name: /edit grok 4\.1 fast/i })
    fireEvent.click(editButtons[0])

    expect(screen.getByText('Edit Model')).toBeInTheDocument()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toContainElement(screen.getByDisplayValue('Grok 4.1 Fast'))
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
  })

  it('updates model when edit dialog is saved', () => {
    const onChange = vi.fn()
    render(<ProviderHubSection {...baseProps} onChange={onChange} />)

    fireEvent.click(
      screen.getByText('OpenRouter provides access to many frontier models through one API.')
    )

    const editButtons = screen.getAllByRole('button', { name: /edit grok 4\.1 fast/i })
    fireEvent.click(editButtons[0])

    fireEvent.change(screen.getByPlaceholderText(/please enter the display name/i), {
      target: { value: 'Grok 4.1 Fast (Edited)' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        configuredModels: expect.arrayContaining([
          expect.objectContaining({
            code: 'x-ai/grok-4.1-fast',
            displayName: 'Grok 4.1 Fast (Edited)',
          }),
        ]),
      })
    )
  })

  it('auto-fills OpenRouter model specs when a model id is entered', async () => {
    const onChange = vi.fn()
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'openai/gpt-4o-mini',
            name: 'GPT-4o Mini',
            description: 'Fast multimodal model',
            context_length: 128000,
            architecture: {
              input_modalities: ['text', 'image'],
              output_modalities: ['text'],
            },
            supported_parameters: ['tools', 'temperature', 'top_p'],
            pricing: {
              web_search: '0.01',
            },
          },
        ],
      }),
    })

    render(<ProviderHubSection {...baseProps} onChange={onChange} />)

    fireEvent.click(
      screen.getByText('OpenRouter provides access to many frontier models through one API.')
    )
    fireEvent.click(screen.getByRole('button', { name: /add custom model/i }))

    const modelIdInput = screen.getByPlaceholderText(/please enter the model id/i)
    fireEvent.change(modelIdInput, { target: { value: 'openai/gpt-4o-mini' } })
    fireEvent.blur(modelIdInput)

    await waitFor(() => {
      expect(screen.getByDisplayValue('GPT-4o Mini')).toBeInTheDocument()
    })

    expect(fetchMock).toHaveBeenCalled()
    expect(screen.getByDisplayValue('128000')).toBeInTheDocument()
    expect(screen.getByText(/model spec loaded from openrouter/i)).toBeInTheDocument()
  })

  it('opens the selected provider dashboard from the detail header', () => {
    render(<ProviderHubSection {...baseProps} />)

    fireEvent.click(
      screen.getByText('OpenRouter provides access to many frontier models through one API.')
    )
    fireEvent.click(screen.getByRole('button', { name: /open openrouter dashboard/i }))

    expect(openExternal).toHaveBeenCalledWith('https://openrouter.ai/settings/keys')
  })

  it('opens delete confirmation when Delete is clicked in model dropdown', async () => {
    render(<ProviderHubSection {...baseProps} />)

    fireEvent.click(
      screen.getByText('OpenRouter provides access to many frontier models through one API.')
    )

    const moreButtons = screen.getAllByRole('button', { name: /more actions for grok 4\.1 fast/i })
    fireEvent.pointerDown(moreButtons[0], { button: 0, ctrlKey: false })
    fireEvent.click(screen.getAllByRole('menuitem', { name: /delete/i })[0])

    expect(screen.getByText('Delete Model')).toBeInTheDocument()
    expect(
      screen.getByText(
        (content, element) =>
          element?.textContent === 'Remove "Grok 4.1 Fast" from your model list?'
      )
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument()
  })

  it('removes model when delete is confirmed', async () => {
    const onChange = vi.fn()
    render(<ProviderHubSection {...baseProps} onChange={onChange} />)

    fireEvent.click(
      screen.getByText('OpenRouter provides access to many frontier models through one API.')
    )

    const moreButtons = screen.getAllByRole('button', { name: /more actions for grok 4\.1 fast/i })
    fireEvent.pointerDown(moreButtons[0], { button: 0, ctrlKey: false })
    fireEvent.click(screen.getAllByRole('menuitem', { name: /delete/i })[0])
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        configuredModels: expect.arrayContaining([
          expect.objectContaining({ code: 'x-ai/grok-4.1-mini', displayName: 'Grok 4.1 Mini' }),
          expect.objectContaining({ code: 'openrouter/image-model', displayName: 'ImageGen Pro' }),
        ]),
      })
    )
    expect(onChange.mock.calls[0][0].configuredModels).not.toContainEqual(
      expect.objectContaining({ code: 'x-ai/grok-4.1-fast' })
    )
  })

  it('removes all models for the selected provider when confirmed', async () => {
    const onChange = vi.fn()
    render(<ProviderHubSection {...baseProps} onChange={onChange} />)

    fireEvent.click(
      screen.getByText('OpenRouter provides access to many frontier models through one API.')
    )
    fireEvent.click(screen.getByRole('button', { name: /remove all/i }))

    expect(screen.getByText('Remove All Models')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^remove all$/i }))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        configuredModels: [],
      })
    )
  })

  it('disables provider without clearing API key', () => {
    const onChange = vi.fn()
    render(
      <ProviderHubSection
        {...baseProps}
        openRouterApiKey="or-key-123"
        providerEnabled={{
          openrouter: true,
          perplexity: true,
          groq: true,
          ollama: true,
          alibaba: true,
        }}
        onChange={onChange}
      />
    )

    fireEvent.click(screen.getByLabelText('Toggle OpenRouter'))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        providerEnabled: expect.objectContaining({ openrouter: false }),
      })
    )
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ openRouterApiKey: '' }))
  })

  it('does not open provider detail when toggling provider switch', () => {
    const onChange = vi.fn()
    render(
      <ProviderHubSection
        {...baseProps}
        providerEnabled={{
          openrouter: false,
          perplexity: true,
          groq: true,
          ollama: true,
          alibaba: true,
        }}
        onChange={onChange}
      />
    )

    fireEvent.click(screen.getByLabelText('Toggle OpenRouter'))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        providerEnabled: expect.objectContaining({ openrouter: true }),
      })
    )
    expect(screen.queryByLabelText('Back to providers')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/OpenRouter API Key/i)).not.toBeInTheDocument()
  })

  it('runs Alibaba connectivity check against chat completions endpoint', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'ok' }),
    } as Response)

    render(<ProviderHubSection {...baseProps} alibabaApiKey="test-key" />)

    fireEvent.click(screen.getByText('Qwen models via DashScope API (Tongyi).'))

    const checkButton = await screen.findByRole('button', { name: /^check$/i })
    fireEvent.click(checkButton)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/chat/completions'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key',
          }),
        })
      )
    })

    fetchMock.mockRestore()
  })

  it('shows Fireworks catalog controls in provider detail view', () => {
    render(<ProviderHubSection {...baseProps} />)

    fireEvent.click(
      screen.getByText('Fast inference platform with an official serverless model catalog.')
    )

    expect(screen.getByRole('button', { name: /add from catalog/i })).toBeInTheDocument()
    expect(screen.getByText('DeepSeek V3.2')).toBeInTheDocument()
  })

  it('shows Perplexity catalog controls in provider detail view', () => {
    render(<ProviderHubSection {...baseProps} />)

    fireEvent.click(
      screen.getByText('Research-focused model provider with search-native reasoning models.')
    )

    expect(screen.getByRole('button', { name: /add from catalog/i })).toBeInTheDocument()
    expect(screen.getByText('Sonar')).toBeInTheDocument()
  })

  it('renders the Fireworks provider row with the compact site icon', () => {
    render(<ProviderHubSection {...baseProps} />)

    const img = screen.getByAltText('fireworks logo')
    expect(img).toHaveStyle({ width: '20px', height: '20px' })
  })

  it('updates Tavily search speed preference from Search APIs settings', async () => {
    const onChange = vi.fn()
    render(<ProviderHubSection {...baseProps} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Service APIs' }))
    fireEvent.click(
      screen.getByText('AI-optimized search for web_search. Add a key for best results.')
    )
    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(await screen.findByRole('option', { name: 'Lightning' }))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ tavilySearchDepthPreference: 'ultra-fast' })
    )
  })

  it('updates Tavily image preference from Search APIs settings', async () => {
    const onChange = vi.fn()
    render(<ProviderHubSection {...baseProps} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Service APIs' }))
    fireEvent.click(
      screen.getByText('AI-optimized search for web_search. Add a key for best results.')
    )
    fireEvent.click(screen.getByRole('switch', { name: 'Include web search images' }))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ webSearchIncludeImages: false })
    )
  })

  it('updates OpenRouter debug preference from provider settings', () => {
    const onChange = vi.fn()
    render(<ProviderHubSection {...baseProps} onChange={onChange} />)

    fireEvent.click(
      screen.getByText('OpenRouter provides access to many frontier models through one API.')
    )
    fireEvent.click(screen.getByRole('switch', { name: 'Enable OpenRouter debug logging' }))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ openRouterDebug: true }))
  })

  it('shows Add from Catalog for Alibaba provider', () => {
    render(<ProviderHubSection {...baseProps} />)

    fireEvent.click(screen.getByText('Qwen models via DashScope API (Tongyi).'))

    expect(screen.getByRole('button', { name: /add from catalog/i })).toBeInTheDocument()
  })

  it('opens Alibaba catalog dialog and surfaces the missing-key error', async () => {
    render(<ProviderHubSection {...baseProps} />)

    fireEvent.click(screen.getByText('Qwen models via DashScope API (Tongyi).'))
    fireEvent.click(screen.getByRole('button', { name: /add from catalog/i }))

    expect(await screen.findByText('Add Model from Alibaba Catalog')).toBeInTheDocument()
    expect(
      await screen.findByText('Add an Alibaba API key before loading the catalog.')
    ).toBeInTheDocument()
  })

  it('adds an Alibaba catalog model to alibabaModels', async () => {
    const onChange = vi.fn()
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => createAlibabaCatalogHtml(),
    } as Response)

    render(<ProviderHubSection {...baseProps} alibabaApiKey="ali-key" onChange={onChange} />)

    fireEvent.click(screen.getByText('Qwen models via DashScope API (Tongyi).'))
    fireEvent.click(screen.getByRole('button', { name: /add from catalog/i }))

    expect(await screen.findByText('Qwen3-Coder-Next')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        alibabaModels: expect.arrayContaining([
          expect.objectContaining({
            code: 'qwen3-coder-next',
            displayName: 'Qwen3-Coder-Next',
            supportsToolCall: true,
          }),
        ]),
      })
    )
  })

  it('opens Perplexity catalog dialog and surfaces the missing-key error', async () => {
    render(<ProviderHubSection {...baseProps} />)

    fireEvent.click(
      screen.getByText('Research-focused model provider with search-native reasoning models.')
    )
    fireEvent.click(screen.getByRole('button', { name: /add from catalog/i }))

    expect(await screen.findByText('Add Model from Perplexity Catalog')).toBeInTheDocument()
    expect(
      await screen.findByText('Add a Perplexity API key before loading the catalog.')
    ).toBeInTheDocument()
  })

  it('adds a Perplexity catalog model to perplexityModels', async () => {
    const onChange = vi.fn()
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => createPerplexityCatalogPage(['sonar', 'sonar-pro', 'sonar-deep-research']),
    } as Response)

    render(<ProviderHubSection {...baseProps} perplexityApiKey="px-key" onChange={onChange} />)

    fireEvent.click(
      screen.getByText('Research-focused model provider with search-native reasoning models.')
    )
    fireEvent.click(screen.getByRole('button', { name: /add from catalog/i }))

    expect(await screen.findByText('Sonar Deep Research')).toBeInTheDocument()
    const addButtons = screen.getAllByRole('button', { name: /^add$/i })
    fireEvent.click(addButtons[addButtons.length - 1])

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        perplexityModels: expect.arrayContaining([
          expect.objectContaining({
            code: 'sonar-deep-research',
            displayName: 'Sonar Deep Research',
            supportsWebSearch: true,
            supportsDeepThinking: true,
          }),
        ]),
      })
    )
  })
})

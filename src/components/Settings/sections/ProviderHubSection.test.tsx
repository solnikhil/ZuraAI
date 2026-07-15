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

function openProviderCatalog(name: string): void {
  const configureButton = screen.queryByRole('button', {
    name: new RegExp(`^Configure ${name}$`, 'i'),
  })
  const setupButton = screen.queryByRole('button', { name: new RegExp(`^Set up ${name}$`, 'i') })
  const button = configureButton ?? setupButton
  if (!button) {
    throw new Error(`Could not find catalog button for provider: ${name}`)
  }
  fireEvent.click(button)
}

describe('ProviderHubSection', () => {
  const openExternal = vi.fn()
  const fetchMock = vi.fn()

  const baseProps = {
    openRouterApiKey: '',
    groqApiKey: '',
    alibabaApiKey: '',
    alibabaRegion: 'singapore' as const,
    deepseekApiKey: '',
    opencodeGoApiKey: '',
    fireworksApiKey: '',
    nvidiaApiKey: '',
    tavilyApiKey: '',
    onlineCompilerApiKey: '',
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
    codexModels: [
      {
        code: 'gpt-5.4',
        displayName: 'GPT-5.4',
        enabled: true,
        supportsDeepThinking: true,
        modelType: 'reasoning' as const,
      },
    ],
    groqModels: [{ code: 'llama-3.1-8b-instant', displayName: 'Llama 3.1 8B Instant' }],
    alibabaModels: [{ code: 'qwen-plus', displayName: 'Qwen Plus' }],
    deepseekModels: [{ code: 'deepseek-v4-flash', displayName: 'DeepSeek V4 Flash' }],
    opencodeModels: [{ code: 'deepseek-v4-pro', displayName: 'DeepSeek V4 Pro' }],
    fireworksModels: [
      { code: 'accounts/fireworks/models/deepseek-v3p2', displayName: 'DeepSeek V3.2' },
    ],
    nvidiaModels: [{ code: 'minimaxai/minimax-m3', displayName: 'MiniMax M3' }],
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
    delete (window as Window & { providerRuntime?: unknown }).providerRuntime
    vi.stubGlobal('fetch', fetchMock)
  })

  it('renders providers controls', () => {
    render(<ProviderHubSection {...baseProps} />)

    expect(screen.getByRole('heading', { name: 'Providers' })).toBeInTheDocument()
    expect(screen.getByText('Service APIs')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add custom model/i })).not.toBeInTheDocument()
  })

  it('creates a custom model from add dialog', () => {
    const onChange = vi.fn()
    render(<ProviderHubSection {...baseProps} onChange={onChange} />)

    openProviderCatalog('OpenRouter')
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

    openProviderCatalog('OpenRouter')

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

    openProviderCatalog('OpenRouter')
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

    openProviderCatalog('OpenRouter')

    expect(screen.getByText(/All \(/)).toBeInTheDocument()
    expect(screen.getByText(/Chat \(/)).toBeInTheDocument()
    expect(screen.getByLabelText('Toggle ImageGen Pro')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Chat \(/ }))
    expect(screen.queryByLabelText('Toggle ImageGen Pro')).not.toBeInTheDocument()
  })

  it('opens edit dialog when Edit is clicked on a model', () => {
    const onChange = vi.fn()
    render(<ProviderHubSection {...baseProps} onChange={onChange} />)

    openProviderCatalog('OpenRouter')

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

    openProviderCatalog('OpenRouter')

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

    openProviderCatalog('OpenRouter')
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

    openProviderCatalog('OpenRouter')
    fireEvent.click(screen.getByRole('button', { name: /open openrouter dashboard/i }))

    expect(openExternal).toHaveBeenCalledWith('https://openrouter.ai/settings/keys')
  })

  it('opens delete confirmation when Delete is clicked in model dropdown', async () => {
    render(<ProviderHubSection {...baseProps} />)

    openProviderCatalog('OpenRouter')

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

    openProviderCatalog('OpenRouter')

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

    openProviderCatalog('OpenRouter')
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

    openProviderCatalog('Alibaba Cloud')

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

  it('runs DeepSeek connectivity check against chat completions endpoint and shows success', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'ok' }),
    } as Response)

    render(<ProviderHubSection {...baseProps} deepseekApiKey="deepseek-key" />)

    openProviderCatalog('DeepSeek')

    const checkButton = await screen.findByRole('button', { name: /^check$/i })
    fireEvent.click(checkButton)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.deepseek.com/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer deepseek-key',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            model: 'deepseek-v4-flash',
            messages: [{ role: 'user', content: 'ping' }],
            max_tokens: 1,
          }),
        })
      )
    })

    expect(
      await screen.findByText('Connection successful. API key and model are reachable.')
    ).toBeInTheDocument()

    fetchMock.mockRestore()
  })

  it('shows Fireworks catalog controls in provider detail view', () => {
    render(<ProviderHubSection {...baseProps} />)

    openProviderCatalog('Fireworks')

    expect(screen.getByRole('button', { name: /add from catalog/i })).toBeInTheDocument()
    expect(screen.getByText('DeepSeek V3.2')).toBeInTheDocument()
  })

  it('renders the Fireworks provider row with the compact site icon', () => {
    render(<ProviderHubSection {...baseProps} />)

    const img = screen.getByAltText('fireworks logo')
    expect(img).toHaveStyle({ width: '22px', height: '22px' })
  })

  it('updates Tavily search speed preference from Search APIs settings', async () => {
    const onChange = vi.fn()
    render(<ProviderHubSection {...baseProps} onChange={onChange} />)

    openProviderCatalog('Tavily')
    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(await screen.findByRole('option', { name: 'Lightning' }))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ tavilySearchDepthPreference: 'ultra-fast' })
    )
  })

  it('updates Tavily image preference from Search APIs settings', async () => {
    const onChange = vi.fn()
    render(<ProviderHubSection {...baseProps} onChange={onChange} />)

    openProviderCatalog('Tavily')
    fireEvent.click(screen.getByRole('switch', { name: 'Include web search images' }))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ webSearchIncludeImages: false })
    )
  })

  it('shows Add from Catalog for Alibaba provider', () => {
    render(<ProviderHubSection {...baseProps} />)

    openProviderCatalog('Alibaba Cloud')

    expect(screen.getByRole('button', { name: /add from catalog/i })).toBeInTheDocument()
  })

  it('opens Alibaba catalog without requiring a key', async () => {
    render(<ProviderHubSection {...baseProps} />)

    openProviderCatalog('Alibaba Cloud')
    fireEvent.click(screen.getByRole('button', { name: /add from catalog/i }))

    expect(await screen.findByText('Add Model from Alibaba Catalog')).toBeInTheDocument()
    expect(await screen.findByText('Qwen3.7-Max')).toBeInTheDocument()
  })

  it('renders ChatGPT Codex as an account-backed provider without an API-key field', () => {
    render(<ProviderHubSection {...baseProps} />)

    openProviderCatalog('ChatGPT Codex')

    expect(screen.getByText('ChatGPT Account')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in with ChatGPT' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Check ChatGPT sign-in' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Ollama Endpoint')).not.toBeInTheDocument()
    expect(screen.queryByText('Your key is stored in')).not.toBeInTheDocument()
  })

  it('signs in through main and replaces the placeholder with account-discovered models', async () => {
    const onChange = vi.fn()
    const providerRuntime = {
      getCodexAuthStatus: vi.fn(async () => ({ signedIn: false })),
      signInCodex: vi.fn(async () => true),
      listModels: vi.fn(async () => [
        {
          code: 'gpt-5.5',
          displayName: 'GPT-5.5',
          enabled: true,
          supportsDeepThinking: true,
        },
      ]),
    }
    ;(window as Window & { providerRuntime?: unknown }).providerRuntime = providerRuntime

    render(<ProviderHubSection {...baseProps} onChange={onChange} />)
    openProviderCatalog('ChatGPT Codex')
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with ChatGPT' }))

    await waitFor(() => expect(providerRuntime.signInCodex).toHaveBeenCalledOnce())
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          codexModels: [expect.objectContaining({ code: 'gpt-5.5' })],
        })
      )
    )
    expect(providerRuntime.listModels).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'codex', requestId: expect.any(String) })
    )
  })

  it('adds an Alibaba catalog model to alibabaModels', async () => {
    const onChange = vi.fn()

    render(<ProviderHubSection {...baseProps} alibabaApiKey="ali-key" onChange={onChange} />)

    openProviderCatalog('Alibaba Cloud')
    fireEvent.click(screen.getByRole('button', { name: /add from catalog/i }))

    expect(await screen.findByText('Qwen3.7-Max')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: /^add$/i })[0])

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        alibabaModels: expect.arrayContaining([
          expect.objectContaining({
            code: 'qwen3.7-max',
            displayName: 'Qwen3.7-Max',
            supportsToolCall: true,
          }),
        ]),
      })
    )
  })

  it('adds an OpenCode Go catalog model to opencodeModels', async () => {
    const onChange = vi.fn()
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          object: 'list',
          data: [
            { id: 'deepseek-v4-pro', object: 'model', owned_by: 'opencode' },
            { id: 'kimi-k2.7-code', object: 'model', owned_by: 'opencode' },
          ],
        }),
    } as Response)

    render(<ProviderHubSection {...baseProps} opencodeGoApiKey="" onChange={onChange} />)

    openProviderCatalog('OpenCode Go')
    fireEvent.click(screen.getByRole('button', { name: /add from catalog/i }))

    expect(await screen.findByText('Kimi K2.7 Code')).toBeInTheDocument()
    const addButtons = screen.getAllByRole('button', { name: /^add$/i })
    fireEvent.click(addButtons[addButtons.length - 1])

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        opencodeModels: expect.arrayContaining([
          expect.objectContaining({
            code: 'kimi-k2.7-code',
            displayName: 'Kimi K2.7 Code',
            supportsToolCall: true,
          }),
        ]),
      })
    )
  })

  it('adds an NVIDIA catalog model to nvidiaModels', async () => {
    const onChange = vi.fn()
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        object: 'list',
        data: [
          { id: 'minimaxai/minimax-m3', object: 'model', owned_by: 'minimaxai' },
          { id: 'nvidia/llama-chat', object: 'model', owned_by: 'nvidia' },
        ],
      }),
    } as Response)

    render(<ProviderHubSection {...baseProps} nvidiaApiKey="nvapi-key" onChange={onChange} />)

    openProviderCatalog('NVIDIA NIM')
    fireEvent.click(screen.getByRole('button', { name: /add from catalog/i }))

    expect(await screen.findByText('Llama Chat')).toBeInTheDocument()
    const addButtons = screen.getAllByRole('button', { name: /^add$/i })
    fireEvent.click(addButtons[addButtons.length - 1])

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        nvidiaModels: expect.arrayContaining([
          expect.objectContaining({
            code: 'nvidia/llama-chat',
            displayName: 'Llama Chat',
            modelType: 'chat',
          }),
        ]),
      })
    )
  })

  it('shows a per-model reasoning toggle for DeepSeek and persists enablement', () => {
    const onChange = vi.fn()
    render(<ProviderHubSection {...baseProps} onChange={onChange} />)

    openProviderCatalog('DeepSeek')

    const reasoningToggle = screen.getByLabelText('Toggle reasoning for DeepSeek V4 Flash')
    expect(reasoningToggle).toBeInTheDocument()
    fireEvent.click(reasoningToggle)

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        deepseekReasoning: expect.objectContaining({
          'deepseek-v4-flash': { enabled: true, effort: 'high' },
        }),
      })
    )
  })

  it('does not show a reasoning toggle for non-DeepSeek providers', () => {
    render(<ProviderHubSection {...baseProps} />)

    openProviderCatalog('OpenRouter')

    expect(screen.queryByLabelText(/Toggle reasoning for/i)).not.toBeInTheDocument()
  })

  it('shows OpenRouter reasoning detection status without manual controls', () => {
    render(
      <ProviderHubSection
        {...baseProps}
        configuredModels={[
          {
            code: 'moonshotai/kimi-k2-thinking',
            displayName: 'Kimi K2 Thinking',
            supportsDeepThinking: true,
            openRouterReasoningDetected: true,
          },
        ]}
      />
    )

    openProviderCatalog('OpenRouter')

    expect(screen.getByText('Reasoning detected')).toBeInTheDocument()
    expect(
      screen.queryByLabelText('Toggle OpenRouter reasoning for Kimi K2 Thinking')
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /reasoning/i })).not.toBeInTheDocument()
  })

  it('detects OpenRouter reasoning support from the catalog for existing rows', async () => {
    const onChange = vi.fn()
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'x-ai/grok-4.1-fast',
            name: 'Grok 4.1 Fast',
            supported_parameters: ['reasoning', 'tools'],
          },
        ],
      }),
    })

    render(<ProviderHubSection {...baseProps} onChange={onChange} />)

    openProviderCatalog('OpenRouter')
    fireEvent.click(screen.getAllByRole('button', { name: /detect reasoning/i })[0])

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          configuredModels: expect.arrayContaining([
            expect.objectContaining({
              code: 'x-ai/grok-4.1-fast',
              supportsDeepThinking: true,
              modelType: 'reasoning',
              openRouterReasoningDetected: true,
            }),
          ]),
        })
      )
    })
  })
})

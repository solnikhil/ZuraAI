import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ModelSelector from './ModelSelector'

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverMock)

vi.mock('../../../contexts/ModelSelectorContext', () => ({
  useModelSelectorContext: () => ({
    consumeRequest: () => false,
  }),
}))

const updateSettings = vi.fn()
let mockSettings = {
  modelProvider: 'fireworks',
  aiModel: 'accounts/fireworks/models/deepseek-v3p2',
  modelSelector: {},
  openRouterReasoningEffort: {},
}

vi.mock('../../../contexts/SettingsContext', () => ({
  useSettings: () => ({
    settings: mockSettings,
    updateSettings,
  }),
}))

const fireworksModel = {
  code: 'accounts/fireworks/models/deepseek-v3p2',
  displayName: 'DeepSeek V3.2',
  provider: 'fireworks',
}

const openRouterReasoningModel = {
  code: 'nex-agi/nex-n2-pro:free',
  displayName: 'Nex-N2-Pro',
  provider: 'openrouter',
  supportsDeepThinking: true,
  openRouterReasoningDetected: true,
}

let mockCurrentModel = fireworksModel
let mockCurrentName = 'DeepSeek V3.2'
const setIsOpen = vi.fn()
const handleSelect = vi.fn()

vi.mock('./useModelSelector', () => ({
  useModelSelector: () => ({
    state: {
      isOpen: true,
      searchQuery: '',
      viewMode: 'all',
      selectedProvider: mockSettings.modelProvider,
      collapsedGroups: {},
      focusedIndex: -1,
    },
    groupedModels: {
      alibaba: [],
      deepseek: [],
      fireworks: mockCurrentModel.provider === 'fireworks' ? [mockCurrentModel] : [],
      groq: [],
      ollama: [],
      openrouter: mockCurrentModel.provider === 'openrouter' ? [mockCurrentModel] : [],
      perplexity: [],
    },
    currentModel: mockCurrentModel,
    currentName: mockCurrentName,
    setIsOpen,
    handleSelect,
  }),
}))

describe('ModelSelector', () => {
  beforeEach(() => {
    updateSettings.mockReset()
    setIsOpen.mockReset()
    handleSelect.mockReset()
    mockSettings = {
      modelProvider: 'fireworks',
      aiModel: 'accounts/fireworks/models/deepseek-v3p2',
      modelSelector: {},
      openRouterReasoningEffort: {},
    }
    mockCurrentModel = fireworksModel
    mockCurrentName = 'DeepSeek V3.2'
  })

  it('renders a minimal trigger with the selected model name and no provider icon', () => {
    const { container } = render(<ModelSelector minimal={true} popoverAlign="end" />)

    expect(screen.getByRole('button', { name: /deepseek v3\.2/i })).toBeInTheDocument()
    expect(container.querySelector('img[alt*="logo"]')).toBeNull()
  })

  it('does not show reasoning effort for non-reasoning active models', () => {
    render(<ModelSelector minimal={true} />)
    expect(screen.queryByText(/· (high|xhigh|medium|low)/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Reasoning effort')).not.toBeInTheDocument()
  })

  it('enables the reasoning effort area for detected OpenRouter reasoning models', async () => {
    mockSettings = {
      modelProvider: 'openrouter',
      aiModel: 'nex-agi/nex-n2-pro:free',
      modelSelector: {},
      openRouterReasoningEffort: { 'nex-agi/nex-n2-pro:free': 'medium' },
    }
    mockCurrentModel = openRouterReasoningModel
    mockCurrentName = 'Nex-N2-Pro'

    render(<ModelSelector minimal={true} />)

    expect(screen.getByText('M')).toBeInTheDocument()
    expect(await screen.findByText('Reasoning effort')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitemradio', { name: /xhigh/i }))

    expect(updateSettings).toHaveBeenCalledWith({
      openRouterReasoningEffort: {
        'nex-agi/nex-n2-pro:free': 'xhigh',
      },
    })
  })
})

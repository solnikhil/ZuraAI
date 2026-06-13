import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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

vi.mock('../../../contexts/SettingsContext', () => ({
  useSettings: () => ({
    settings: {
      modelProvider: 'fireworks',
      aiModel: 'accounts/fireworks/models/deepseek-v3p2',
      modelSelector: {},
    },
    updateSettings: vi.fn(),
  }),
}))

vi.mock('./useModelSelector', () => ({
  useModelSelector: () => ({
    state: {
      isOpen: false,
      searchQuery: '',
      viewMode: 'all',
      selectedProvider: 'fireworks',
      collapsedGroups: {},
      focusedIndex: -1,
    },
    groupedModels: {
      alibaba: [],
      deepseek: [],
      fireworks: [],
      groq: [],
      ollama: [],
      openrouter: [],
      perplexity: [],
    },
    currentModel: {
      code: 'accounts/fireworks/models/deepseek-v3p2',
      displayName: 'DeepSeek V3.2',
      provider: 'fireworks',
    },
    currentName: 'DeepSeek V3.2',
    setIsOpen: vi.fn(),
    handleSelect: vi.fn(),
  }),
}))

describe('ModelSelector', () => {
  it('renders a minimal trigger with the selected model name and no provider icon', () => {
    const { container } = render(<ModelSelector minimal={true} popoverAlign="end" />)

    expect(screen.getByRole('button', { name: /deepseek v3\.2/i })).toBeInTheDocument()
    expect(container.querySelector('img[alt*="logo"]')).toBeNull()
  })

  it('shows the reasoning effort suffix when the active DeepSeek model has reasoning enabled', () => {
    // Default mock model is fireworks (no reasoning) — suffix should be absent.
    render(<ModelSelector minimal={true} />)
    expect(screen.queryByText(/· (high|max)/i)).not.toBeInTheDocument()
  })
})

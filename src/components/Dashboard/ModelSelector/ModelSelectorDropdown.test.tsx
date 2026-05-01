import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ModelSelectorDropdown } from './ModelSelectorDropdown'

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock)
vi.stubGlobal('scrollTo', vi.fn())
Element.prototype.scrollIntoView = vi.fn()

let modelSelectorSettings = {
  sidebarPosition: 'left' as const,
  sidebarShowLabels: false,
  sidebarShowModelCount: false,
  dropdownWidth: 'default' as const,
  showDescriptions: false,
  showCapabilityBadges: false,
  capabilityBadgeDisplay: 'both' as const,
  showProviderLogos: true,
  showFavoriteStars: false,
  showContextLength: true,
  showInfoTooltips: true,
  activeIndicatorStyle: 'dot' as const,
  itemDensity: 'compact' as const,
  defaultView: 'lastUsed' as const,
  autoCloseOnSelect: true,
  rememberProvider: true,
  showSearch: true,
  enableAnimations: false,
  staggerSpeed: 'normal' as const,
}

vi.mock('../../../contexts/SettingsContext', () => ({
  useSettings: () => ({
    settings: {
      modelSelector: modelSelectorSettings,
    },
  }),
}))

vi.mock('../../../contexts/AppShellContext', () => ({
  useAppShell: () => ({
    setDashboardView: vi.fn(),
    setActiveSettingsSection: vi.fn(),
  }),
}))

describe('ModelSelectorDropdown', () => {
  beforeEach(() => {
    modelSelectorSettings = {
      sidebarPosition: 'left',
      sidebarShowLabels: false,
      sidebarShowModelCount: false,
      dropdownWidth: 'default',
      showDescriptions: false,
      showCapabilityBadges: false,
      capabilityBadgeDisplay: 'both',
      showProviderLogos: true,
      showFavoriteStars: false,
      showContextLength: true,
      showInfoTooltips: true,
      activeIndicatorStyle: 'dot',
      itemDensity: 'compact',
      defaultView: 'lastUsed',
      autoCloseOnSelect: true,
      rememberProvider: true,
      showSearch: true,
      enableAnimations: false,
      staggerSpeed: 'normal',
    }
  })

  const fireworksModel = {
    code: 'accounts/fireworks/models/deepseek-v3p2',
    displayName: 'DeepSeek V3.2',
    provider: 'fireworks' as const,
    supportsVision: true,
  }

  it('renders the search input above the provider rail', () => {
    const { container } = render(
      <ModelSelectorDropdown
        searchInputRef={{ current: null }}
        searchQuery=""
        onSearchChange={vi.fn()}
        viewMode="all"
        onViewModeChange={vi.fn()}
        selectedProvider="fireworks"
        onProviderSelect={vi.fn()}
        currentModels={[fireworksModel]}
        groupedModels={{
          alibaba: [],
          fireworks: [fireworksModel],
          groq: [],
          ollama: [],
          openrouter: [],
          perplexity: [],
        }}
        focusedIndex={-1}
        selectedModelCode="accounts/fireworks/models/deepseek-v3p2"
        selectedModelProvider="fireworks"
        favoriteModels={[]}
        onModelSelect={vi.fn()}
        onToggleFavorite={vi.fn()}
        onFocusedIndexChange={vi.fn()}
      />
    )

    const searchInput = screen.getByPlaceholderText('Search models, providers...')
    const sidebar = container.querySelector('[data-sidebar]')

    expect(searchInput).toBeInTheDocument()
    expect(sidebar).toBeInTheDocument()
    expect(searchInput.compareDocumentPosition(sidebar as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows Fireworks in the provider sidebar when Fireworks models are available', () => {
    render(
      <ModelSelectorDropdown
        searchInputRef={{ current: null }}
        searchQuery=""
        onSearchChange={vi.fn()}
        viewMode="all"
        onViewModeChange={vi.fn()}
        selectedProvider="fireworks"
        onProviderSelect={vi.fn()}
        currentModels={[fireworksModel]}
        groupedModels={{
          alibaba: [],
          fireworks: [fireworksModel],
          groq: [],
          ollama: [],
          openrouter: [],
          perplexity: [],
        }}
        focusedIndex={-1}
        selectedModelCode="accounts/fireworks/models/deepseek-v3p2"
        selectedModelProvider="fireworks"
        favoriteModels={[]}
        onModelSelect={vi.fn()}
        onToggleFavorite={vi.fn()}
        onFocusedIndexChange={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: /fireworks/i })).toBeInTheDocument()
    expect(screen.getByText('DeepSeek V3.2')).toBeInTheDocument()
    expect(screen.getByAltText('fireworks logo')).toHaveStyle({ width: '20px', height: '20px' })
    expect(screen.getByRole('button', { name: 'Fireworks' })).toBeInTheDocument()
    expect(screen.queryByText('OpenRouter')).not.toBeInTheDocument()
  })

  it('does not show the empty provider CTA when another provider still has models', () => {
    render(
      <ModelSelectorDropdown
        searchInputRef={{ current: null }}
        searchQuery=""
        onSearchChange={vi.fn()}
        viewMode="all"
        onViewModeChange={vi.fn()}
        selectedProvider="openrouter"
        onProviderSelect={vi.fn()}
        currentModels={[fireworksModel]}
        groupedModels={{
          alibaba: [],
          fireworks: [fireworksModel],
          groq: [],
          ollama: [],
          openrouter: [],
          perplexity: [],
        }}
        focusedIndex={-1}
        selectedModelCode="accounts/fireworks/models/deepseek-v3p2"
        selectedModelProvider="fireworks"
        favoriteModels={[]}
        onModelSelect={vi.fn()}
        onToggleFavorite={vi.fn()}
        onFocusedIndexChange={vi.fn()}
      />
    )

    expect(screen.queryByText('No models configured')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open Provider Settings' })).not.toBeInTheDocument()
  })

  it('hides descriptions, capability badges, and favorite stars by default', () => {
    render(
      <ModelSelectorDropdown
        searchInputRef={{ current: null }}
        searchQuery=""
        onSearchChange={vi.fn()}
        viewMode="all"
        onViewModeChange={vi.fn()}
        selectedProvider="fireworks"
        onProviderSelect={vi.fn()}
        currentModels={[fireworksModel]}
        groupedModels={{
          alibaba: [],
          fireworks: [fireworksModel],
          groq: [],
          ollama: [],
          openrouter: [],
          perplexity: [],
        }}
        focusedIndex={-1}
        selectedModelCode="accounts/fireworks/models/deepseek-v3p2"
        selectedModelProvider="fireworks"
        favoriteModels={['accounts/fireworks/models/deepseek-v3p2']}
        onModelSelect={vi.fn()}
        onToggleFavorite={vi.fn()}
        onFocusedIndexChange={vi.fn()}
      />
    )

    expect(screen.queryByText('Serverless inference via Fireworks')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Supports images & vision')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  it('shows optional metadata when the corresponding settings are enabled', () => {
    modelSelectorSettings = {
      ...modelSelectorSettings,
      showDescriptions: true,
      showCapabilityBadges: true,
      showFavoriteStars: true,
    }

    render(
      <ModelSelectorDropdown
        searchInputRef={{ current: null }}
        searchQuery=""
        onSearchChange={vi.fn()}
        viewMode="all"
        onViewModeChange={vi.fn()}
        selectedProvider="fireworks"
        onProviderSelect={vi.fn()}
        currentModels={[fireworksModel]}
        groupedModels={{
          alibaba: [],
          fireworks: [fireworksModel],
          groq: [],
          ollama: [],
          openrouter: [],
          perplexity: [],
        }}
        focusedIndex={-1}
        selectedModelCode="accounts/fireworks/models/deepseek-v3p2"
        selectedModelProvider="fireworks"
        favoriteModels={['accounts/fireworks/models/deepseek-v3p2']}
        onModelSelect={vi.fn()}
        onToggleFavorite={vi.fn()}
        onFocusedIndexChange={vi.fn()}
      />
    )

    expect(screen.getByText('Serverless inference via Fireworks')).toBeInTheDocument()
    expect(screen.getByLabelText('Supports images & vision')).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(3)
  })
})

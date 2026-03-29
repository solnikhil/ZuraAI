import React from 'react'
import { describe, expect, it, vi } from 'vitest'
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

vi.mock('../../../contexts/SettingsContext', () => ({
  useSettings: () => ({
    settings: {
      modelSelector: {
        sidebarPosition: 'left',
        sidebarShowLabels: true,
        sidebarShowModelCount: true,
        dropdownWidth: 'default',
        showDescriptions: true,
        showCapabilityBadges: true,
        capabilityBadgeDisplay: 'both',
        showProviderLogos: true,
        showFavoriteStars: true,
        showContextLength: true,
        showInfoTooltips: true,
        activeIndicatorStyle: 'dot',
        itemDensity: 'comfortable',
        defaultView: 'lastUsed',
        autoCloseOnSelect: true,
        rememberProvider: true,
        showSearch: true,
        enableAnimations: false,
        staggerSpeed: 'normal',
      },
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
        currentModels={[
          {
            code: 'accounts/fireworks/models/deepseek-v3p2',
            displayName: 'DeepSeek V3.2',
            provider: 'fireworks',
          },
        ]}
        groupedModels={{
          alibaba: [],
          fireworks: [
            {
              code: 'accounts/fireworks/models/deepseek-v3p2',
              displayName: 'DeepSeek V3.2',
              provider: 'fireworks',
            },
          ],
          groq: [],
          ollama: [],
          openrouter: [],
          perplexity: [],
        }}
        selectedModelCode="accounts/fireworks/models/deepseek-v3p2"
        selectedModelProvider="fireworks"
        favoriteModels={[]}
        onModelSelect={vi.fn()}
        onToggleFavorite={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: /fireworks/i })).toBeInTheDocument()
    expect(screen.getByText('DeepSeek V3.2')).toBeInTheDocument()
    expect(screen.getByAltText('fireworks logo')).toHaveStyle({ width: '16px', height: '16px' })
  })
})

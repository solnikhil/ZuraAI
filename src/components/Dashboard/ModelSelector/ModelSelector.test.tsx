import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ModelSelector from './ModelSelector'

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
      modelSelector: {
        dropdownWidth: 'default',
      },
    },
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
    searchInputRef: { current: null },
    currentModels: [],
    groupedModels: {
      alibaba: [],
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
    setSearchQuery: vi.fn(),
    setViewMode: vi.fn(),
    setSelectedProvider: vi.fn(),
    setFocusedIndex: vi.fn(),
    setIsOpen: vi.fn(),
    toggleFavorite: vi.fn(),
    handleSelect: vi.fn(),
  }),
}))

vi.mock('./useResponsiveModelSelector', () => ({
  useResponsiveModelSelector: () => ({
    compactMode: 'none',
    effectiveDropdownWidth: 520,
    effectiveDropdownHeight: 484,
    triggerLabelMaxWidth: '220px',
  }),
}))

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/lib/motion', () => ({
  maybeAnimate: (_enabled: boolean, value: unknown) => value,
  motionDuration: () => 0,
  motionDurations: { micro: 0, fast: 0 },
  motionEasing: { standard: 'easeOut' },
  useMotionPreferences: () => ({ animationsEnabled: false }),
}))

describe('ModelSelector', () => {
  it('renders a minimal trigger with the selected model name and no provider icon', () => {
    const { container } = render(<ModelSelector minimal={true} popoverAlign="end" />)

    expect(screen.getByRole('button', { name: /deepseek v3\.2/i })).toBeInTheDocument()
    expect(container.querySelector('img[alt*="logo"]')).toBeNull()
  })
})

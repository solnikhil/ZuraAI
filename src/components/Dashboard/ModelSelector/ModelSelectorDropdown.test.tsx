import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DropdownMenu, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ModelSelectorDropdown } from './ModelSelectorDropdown'
import { DEEPSEEK_REASONING_EFFORTS } from '../../../utils/deepseekReasoning'
import type { GroupedModels, ModelWithProvider } from './types'

// Radix submenu/positioning needs these in jsdom.
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverMock)
Element.prototype.scrollIntoView = vi.fn()
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {}
}

const fireworksModel: ModelWithProvider = {
  code: 'accounts/fireworks/models/deepseek-v3p2',
  displayName: 'DeepSeek V3.2',
  provider: 'fireworks',
}

const deepseekModel: ModelWithProvider = {
  code: 'deepseek-v4-pro',
  displayName: 'DeepSeek V4 Pro',
  provider: 'deepseek',
}

const emptyGroups: GroupedModels = {
  alibaba: [],
  deepseek: [],
  fireworks: [],
  groq: [],
  ollama: [],
  openrouter: [],
  perplexity: [],
}

function renderOpen(
  props: Partial<React.ComponentProps<typeof ModelSelectorDropdown>> = {}
) {
  const onModelSelect = props.onModelSelect ?? vi.fn()
  const onReasoningEffortChange = props.onReasoningEffortChange ?? vi.fn()
  render(
    <DropdownMenu open>
      <DropdownMenuTrigger>open</DropdownMenuTrigger>
      <ModelSelectorDropdown
        groupedModels={{ ...emptyGroups, fireworks: [fireworksModel] }}
        currentName="DeepSeek V3.2"
        currentModel={fireworksModel}
        selectedModelCode={fireworksModel.code}
        selectedModelProvider="fireworks"
        onModelSelect={onModelSelect}
        showReasoning={false}
        reasoningEnabled={false}
        reasoningEffort="high"
        reasoningEfforts={DEEPSEEK_REASONING_EFFORTS}
        onReasoningEffortChange={onReasoningEffortChange}
        {...props}
      />
    </DropdownMenu>
  )
  return { onModelSelect, onReasoningEffortChange }
}

describe('ModelSelectorDropdown', () => {
  it('renders the current-model row that opens into the provider list', () => {
    renderOpen()

    const currentRow = screen.getByText('DeepSeek V3.2')
    expect(currentRow).toBeInTheDocument()

    fireEvent.click(currentRow)

    // Provider label appears after opening the current-model submenu.
    expect(screen.getByText('Fireworks')).toBeInTheDocument()
    // Providers without models are not listed.
    expect(screen.queryByText('OpenRouter')).not.toBeInTheDocument()
  })

  it('lists the provider models and fires onModelSelect when one is chosen', () => {
    const onModelSelect = vi.fn()
    renderOpen({ onModelSelect, currentName: 'Active Model' })

    fireEvent.click(screen.getByText('Active Model'))
    fireEvent.click(screen.getByText('Fireworks'))

    const modelItem = screen.getByText('DeepSeek V3.2')
    fireEvent.click(modelItem)

    expect(onModelSelect).toHaveBeenCalledWith(
      expect.objectContaining({ code: fireworksModel.code, provider: 'fireworks' })
    )
  })

  it('does not render the reasoning effort section when showReasoning is false', () => {
    renderOpen({ showReasoning: false })
    expect(screen.queryByText('Reasoning effort')).not.toBeInTheDocument()
  })

  it('shows the reasoning effort section and allows selecting None when reasoning is off', () => {
    const onReasoningEffortChange = vi.fn()
    renderOpen({
      showReasoning: true,
      reasoningEnabled: false,
      currentModel: deepseekModel,
      currentName: 'DeepSeek V4 Pro',
      groupedModels: { ...emptyGroups, deepseek: [deepseekModel] },
      selectedModelCode: deepseekModel.code,
      selectedModelProvider: 'deepseek',
      onReasoningEffortChange,
    })

    expect(screen.getByText('Reasoning effort')).toBeInTheDocument()
    const noneItem = screen.getByRole('menuitemradio', { name: /none/i })
    expect(noneItem).toBeInTheDocument()
    fireEvent.click(noneItem)
    expect(onReasoningEffortChange).toHaveBeenCalledWith('none')
  })

  it('shows the reasoning effort section and switches effort when enabled', () => {
    const onReasoningEffortChange = vi.fn()
    renderOpen({
      showReasoning: true,
      reasoningEnabled: true,
      reasoningEffort: 'high',
      currentModel: deepseekModel,
      currentName: 'DeepSeek V4 Pro',
      groupedModels: { ...emptyGroups, deepseek: [deepseekModel] },
      selectedModelCode: deepseekModel.code,
      selectedModelProvider: 'deepseek',
      onReasoningEffortChange,
    })

    expect(screen.getByText('Reasoning effort')).toBeInTheDocument()
    const maxItem = screen.getByRole('menuitemradio', { name: /xhigh/i })
    fireEvent.click(maxItem)
    expect(onReasoningEffortChange).toHaveBeenCalledWith('xhigh')
  })
})



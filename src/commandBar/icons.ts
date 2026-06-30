import React from 'react'
import {
  Search, SettingsIcon, LayoutDashboard, Plus, PanelLeft,
  ChartNoAxesCombined, Cloud, Box, Command, FileText, Globe, Send, Wrench, Terminal,
} from '../components/icons'
import type { CommandBarSuggestion } from './suggestions'

export function getSuggestionIcon(suggestion: CommandBarSuggestion): { Icon: React.ComponentType<{ size?: number; className?: string }>, iconClass: string } {
  // Navigation actions
  if (suggestion.id === 'go-settings') return { Icon: SettingsIcon, iconClass: 'app-titlebar__commandbar-item-icon--navigate' }
  if (suggestion.id === 'go-chat') return { Icon: LayoutDashboard, iconClass: 'app-titlebar__commandbar-item-icon--navigate' }

  // Settings section actions
  if (suggestion.id === 'go-settings-usage') return { Icon: ChartNoAxesCombined, iconClass: 'app-titlebar__commandbar-item-icon--navigate' }
  if (suggestion.id === 'go-settings-providers' || suggestion.id === 'go-settings-models' || suggestion.id === 'go-settings-preferences' ||
      suggestion.id === 'go-settings-openrouter' || suggestion.id === 'go-settings-groq' ||
      suggestion.id === 'go-settings-perplexity' || suggestion.id === 'go-settings-ollama' ||
      suggestion.id === 'go-settings-nvidia') {
    return { Icon: Cloud, iconClass: 'app-titlebar__commandbar-item-icon--navigate' }
  }
  if (suggestion.id === 'go-settings-extensions') return { Icon: Wrench, iconClass: 'app-titlebar__commandbar-item-icon--navigate' }
  if (suggestion.id === 'go-settings-search-apis') return { Icon: Globe, iconClass: 'app-titlebar__commandbar-item-icon--navigate' }
  if (suggestion.id === 'go-settings-themes') return { Icon: Box, iconClass: 'app-titlebar__commandbar-item-icon--navigate' }
  if (suggestion.id === 'go-settings-systemprompt') return { Icon: FileText, iconClass: 'app-titlebar__commandbar-item-icon--navigate' }
  if (suggestion.id === 'go-settings-commandbar') return { Icon: Command, iconClass: 'app-titlebar__commandbar-item-icon--navigate' }

  if (suggestion.id === 'new-chat') return { Icon: Plus, iconClass: 'app-titlebar__commandbar-item-icon--create' }
  if (suggestion.id === 'copy-chat-debug-id') return { Icon: Command, iconClass: 'app-titlebar__commandbar-item-icon--navigate' }
  if (suggestion.id === 'open-chat-debug-panel') return { Icon: Terminal, iconClass: 'app-titlebar__commandbar-item-icon--navigate' }
  if (suggestion.id === 'toggle-memory-monitor') return { Icon: ChartNoAxesCombined, iconClass: 'app-titlebar__commandbar-item-icon--toggle' }

  // Toggle actions
  if (suggestion.id === 'toggle-sidebar-hidden' || suggestion.id === 'toggle-sidebar-collapsed') {
    return { Icon: PanelLeft, iconClass: 'app-titlebar__commandbar-item-icon--toggle' }
  }

  if (suggestion.id.startsWith('export-')) {
    return { Icon: Search, iconClass: 'app-titlebar__commandbar-item-icon--export' }
  }

  // Quick send action
  if (suggestion.id === 'quick-send-message') {
    return { Icon: Send, iconClass: 'app-titlebar__commandbar-item-icon--create' }
  }

  return { Icon: Search, iconClass: '' }
}

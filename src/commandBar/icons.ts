import React from 'react'
import {
  Search, SettingsIcon, LayoutDashboard, Plus, PanelLeft,
  ChartNoAxesCombined, Cloud, Box, Command, FlaskConical, FileText, Globe
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
      suggestion.id === 'go-settings-perplexity' || suggestion.id === 'go-settings-ollama') {
    return { Icon: Cloud, iconClass: 'app-titlebar__commandbar-item-icon--navigate' }
  }
  if (suggestion.id === 'go-settings-search-apis') return { Icon: Globe, iconClass: 'app-titlebar__commandbar-item-icon--navigate' }
  if (suggestion.id === 'go-settings-themes') return { Icon: Box, iconClass: 'app-titlebar__commandbar-item-icon--navigate' }
  if (suggestion.id === 'go-settings-systemprompt') return { Icon: FileText, iconClass: 'app-titlebar__commandbar-item-icon--navigate' }
  if (suggestion.id === 'go-settings-commandbar') return { Icon: Command, iconClass: 'app-titlebar__commandbar-item-icon--navigate' }
  if (suggestion.id === 'go-settings-experimental') return { Icon: FlaskConical, iconClass: 'app-titlebar__commandbar-item-icon--navigate' }

  // Create actions
  if (suggestion.id === 'new-chat') return { Icon: Plus, iconClass: 'app-titlebar__commandbar-item-icon--create' }

  // Toggle actions
  if (suggestion.id === 'toggle-sidebar-hidden' || suggestion.id === 'toggle-sidebar-collapsed') {
    return { Icon: PanelLeft, iconClass: 'app-titlebar__commandbar-item-icon--toggle' }
  }

  // Export actions
  if (suggestion.id.startsWith('export-')) {
    return { Icon: Search, iconClass: 'app-titlebar__commandbar-item-icon--export' }
  }

  return { Icon: Search, iconClass: '' }
}

import type { ModelSelectorSettings } from '../../../contexts/SettingsUIContext'

export const DEFAULT_MODEL_SELECTOR_SETTINGS: ModelSelectorSettings = {
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
  enableAnimations: true,
  staggerSpeed: 'normal',
}

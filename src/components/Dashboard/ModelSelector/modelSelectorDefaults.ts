import type { ModelSelectorSettings } from '../../../contexts/SettingsUIContext'

export const DEFAULT_MODEL_SELECTOR_SETTINGS: ModelSelectorSettings = {
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
  enableAnimations: true,
  staggerSpeed: 'normal',
}

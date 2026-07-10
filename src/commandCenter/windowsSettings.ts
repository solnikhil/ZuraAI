/**
 * Fixed allowlist of Windows Settings pages and related OS surfaces.
 * Main only — never accept freeform ms-settings URIs from the renderer.
 */

export interface WindowsSettingsPageDef {
  /** Stable page id used by system_settings_open and Command Center actions. */
  page: string
  /** User-facing label. */
  label: string
  /** ms-settings: URI (or related allowlisted protocol). */
  uri: string
  /** Short description for Command Center rows. */
  subtitle: string
  aliases: string[]
  minBuild?: number
  requirement?: 'battery' | 'wifi' | 'dynamic-lighting' | 'advanced-display'
  deprecated?: boolean
}

/**
 * Major Windows Settings destinations (curated, fixed allowlist).
 * Not every deep link Microsoft exposes — top-level and common subpages only.
 */
export const WINDOWS_SETTINGS_CATALOG: readonly WindowsSettingsPageDef[] = [
  {
    page: 'home',
    label: 'Windows Settings',
    uri: 'ms-settings:',
    subtitle: 'Open Windows Settings home',
    aliases: ['settings', 'windows settings', 'control panel'],
  },
  {
    page: 'system',
    label: 'System',
    uri: 'ms-settings:system',
    subtitle: 'System overview',
    aliases: ['system settings'],
  },
  {
    page: 'display',
    label: 'Display',
    uri: 'ms-settings:display',
    subtitle: 'Resolution, scaling, multiple displays',
    aliases: ['screen', 'monitor', 'resolution'],
  },
  {
    page: 'nightlight',
    label: 'Night light',
    uri: 'ms-settings:nightlight',
    subtitle: 'Warm colors at night',
    aliases: ['blue light', 'night mode'],
  },
  {
    page: 'advanced-display',
    label: 'Advanced display',
    uri: 'ms-settings:display-advanced',
    subtitle: 'Refresh rate, HDR, and display information',
    aliases: ['refresh rate', 'hdr', 'monitor properties'],
    requirement: 'advanced-display',
  },
  {
    page: 'sound',
    label: 'Sound',
    uri: 'ms-settings:sound',
    subtitle: 'Output, input, volume',
    aliases: ['audio', 'speaker', 'microphone volume'],
  },
  {
    page: 'notifications',
    label: 'Notifications',
    uri: 'ms-settings:notifications',
    subtitle: 'App notifications and banners',
    aliases: ['alerts', 'toasts'],
  },
  {
    page: 'volume-mixer',
    label: 'Volume mixer',
    uri: 'ms-settings:apps-volume',
    subtitle: 'Per-app volume and audio devices',
    aliases: ['app volume', 'mixer', 'per app sound'],
  },
  {
    page: 'sound-devices',
    label: 'All sound devices',
    uri: 'ms-settings:sound-devices',
    subtitle: 'Manage audio input and output devices',
    aliases: ['audio devices', 'speaker devices', 'microphone devices'],
  },
  {
    page: 'focus',
    label: 'Focus',
    uri: 'ms-settings:quiethours',
    subtitle: 'Focus sessions and do not disturb',
    aliases: ['focus assist', 'quiet hours', 'do not disturb'],
  },
  {
    page: 'power',
    label: 'Power & battery',
    uri: 'ms-settings:powersleep',
    subtitle: 'Sleep, battery saver, power mode',
    aliases: ['sleep', 'battery', 'power'],
  },
  {
    page: 'storage',
    label: 'Storage',
    uri: 'ms-settings:storagesense',
    subtitle: 'Disk space and Storage Sense',
    aliases: ['disk', 'storage sense', 'free space'],
  },
  {
    page: 'nearby',
    label: 'Nearby sharing',
    uri: 'ms-settings:crossdevice',
    subtitle: 'Share with nearby devices',
    aliases: ['nearby share', 'share'],
  },
  {
    page: 'storage-recommendations',
    label: 'Cleanup recommendations',
    uri: 'ms-settings:storagerecommendations',
    subtitle: 'Find temporary and unused files',
    aliases: ['clean disk', 'free space', 'cleanup'],
    minBuild: 22000,
  },
  {
    page: 'disks-volumes',
    label: 'Disks & volumes',
    uri: 'ms-settings:disksandvolumes',
    subtitle: 'Manage disks, volumes, and drive letters',
    aliases: ['disk management', 'partitions', 'drive letter'],
  },
  {
    page: 'multitasking',
    label: 'Multitasking',
    uri: 'ms-settings:multitasking',
    subtitle: 'Snap layouts, desktops, Alt+Tab',
    aliases: ['snap layouts', 'virtual desktops', 'alt tab'],
  },
  {
    page: 'about',
    label: 'About',
    uri: 'ms-settings:about',
    subtitle: 'Device specs and Windows version',
    aliases: ['device specs', 'windows version', 'pc info'],
  },
  {
    page: 'bluetooth',
    label: 'Bluetooth & devices',
    uri: 'ms-settings:bluetooth',
    subtitle: 'Bluetooth, printers, and connected devices',
    aliases: ['devices', 'pair', 'bluetooth settings'],
  },
  {
    page: 'printers',
    label: 'Printers & scanners',
    uri: 'ms-settings:printers',
    subtitle: 'Add or manage printers',
    aliases: ['printer', 'scanner'],
  },
  {
    page: 'mouse',
    label: 'Mouse',
    uri: 'ms-settings:mousetouchpad',
    subtitle: 'Pointer speed and buttons',
    aliases: ['pointer', 'touchpad'],
  },
  {
    page: 'touchpad',
    label: 'Touchpad',
    uri: 'ms-settings:devices-touchpad',
    subtitle: 'Touchpad gestures',
    aliases: ['trackpad'],
  },
  {
    page: 'typing',
    label: 'Typing',
    uri: 'ms-settings:typing',
    subtitle: 'Keyboard and text suggestions',
    aliases: ['keyboard', 'spellcheck'],
  },
  {
    page: 'pen',
    label: 'Pen & Windows Ink',
    uri: 'ms-settings:pen',
    subtitle: 'Stylus and ink workspace',
    aliases: ['stylus', 'windows ink'],
  },
  {
    page: 'autoplay',
    label: 'AutoPlay',
    uri: 'ms-settings:autoplay',
    subtitle: 'Removable drive defaults',
    aliases: ['auto play'],
  },
  {
    page: 'usb',
    label: 'USB',
    uri: 'ms-settings:usb',
    subtitle: 'USB device notifications',
    aliases: ['usb settings'],
  },
  {
    page: 'network',
    label: 'Network & internet',
    uri: 'ms-settings:network',
    subtitle: 'Connectivity overview',
    aliases: ['internet', 'network settings'],
  },
  {
    page: 'wifi',
    label: 'Wi‑Fi',
    uri: 'ms-settings:network-wifi',
    subtitle: 'Wireless networks',
    aliases: ['wifi', 'wi-fi', 'wireless'],
  },
  {
    page: 'ethernet',
    label: 'Ethernet',
    uri: 'ms-settings:network-ethernet',
    subtitle: 'Wired network',
    aliases: ['lan', 'wired'],
  },
  {
    page: 'vpn',
    label: 'VPN',
    uri: 'ms-settings:network-vpn',
    subtitle: 'Virtual private networks',
    aliases: ['vpn settings'],
  },
  {
    page: 'mobile-hotspot',
    label: 'Mobile hotspot',
    uri: 'ms-settings:network-mobilehotspot',
    subtitle: 'Share your connection',
    aliases: ['hotspot', 'tethering'],
  },
  {
    page: 'proxy',
    label: 'Proxy',
    uri: 'ms-settings:network-proxy',
    subtitle: 'Proxy server settings',
    aliases: ['proxy settings'],
  },
  {
    page: 'personalization',
    label: 'Personalization',
    uri: 'ms-settings:personalization',
    subtitle: 'Look and feel of Windows',
    aliases: ['appearance', 'theme settings'],
  },
  {
    page: 'background',
    label: 'Background',
    uri: 'ms-settings:personalization-background',
    subtitle: 'Desktop wallpaper',
    aliases: ['wallpaper', 'desktop background'],
  },
  {
    page: 'colors',
    label: 'Colors',
    uri: 'ms-settings:colors',
    subtitle: 'Accent color and dark mode',
    aliases: ['dark mode', 'accent color', 'theme color'],
  },
  {
    page: 'lockscreen',
    label: 'Lock screen',
    uri: 'ms-settings:lockscreen',
    subtitle: 'Lock screen image and status',
    aliases: ['lock screen'],
  },
  {
    page: 'dynamic-lighting',
    label: 'Dynamic Lighting',
    uri: 'ms-settings:personalization-lighting',
    subtitle: 'Control compatible RGB lighting devices',
    aliases: ['rgb', 'lighting', 'device lights'],
    minBuild: 22631,
    requirement: 'dynamic-lighting',
  },
  {
    page: 'themes',
    label: 'Themes',
    uri: 'ms-settings:themes',
    subtitle: 'Windows themes',
    aliases: ['theme pack'],
  },
  {
    page: 'fonts',
    label: 'Fonts',
    uri: 'ms-settings:fonts',
    subtitle: 'Installed fonts',
    aliases: ['typeface'],
  },
  {
    page: 'start',
    label: 'Start',
    uri: 'ms-settings:personalization-start',
    subtitle: 'Start menu layout',
    aliases: ['start menu'],
  },
  {
    page: 'taskbar',
    label: 'Taskbar',
    uri: 'ms-settings:taskbar',
    subtitle: 'Taskbar icons and behavior',
    aliases: ['task bar'],
  },
  {
    page: 'apps',
    label: 'Installed apps',
    uri: 'ms-settings:appsfeatures',
    subtitle: 'Uninstall or modify apps',
    aliases: ['apps', 'programs', 'uninstall'],
  },
  {
    page: 'default-apps',
    label: 'Default apps',
    uri: 'ms-settings:defaultapps',
    subtitle: 'Default browser and file handlers',
    aliases: ['defaults', 'default browser'],
  },
  {
    page: 'optional-features',
    label: 'Optional features',
    uri: 'ms-settings:optionalfeatures',
    subtitle: 'Windows optional components',
    aliases: ['windows features', 'optional components'],
  },
  {
    page: 'startup',
    label: 'Startup apps',
    uri: 'ms-settings:startupapps',
    subtitle: 'Apps that launch at sign-in',
    aliases: ['startup', 'boot apps'],
  },
  {
    page: 'accounts',
    label: 'Accounts',
    uri: 'ms-settings:accounts',
    subtitle: 'Your Microsoft and local accounts',
    aliases: ['user accounts', 'account settings'],
  },
  {
    page: 'your-info',
    label: 'Your info',
    uri: 'ms-settings:yourinfo',
    subtitle: 'Account name and picture',
    aliases: ['profile picture'],
  },
  {
    page: 'email-accounts',
    label: 'Email & accounts',
    uri: 'ms-settings:emailandaccounts',
    subtitle: 'Email, calendar, and accounts used by apps',
    aliases: ['email accounts'],
  },
  {
    page: 'sign-in',
    label: 'Sign-in options',
    uri: 'ms-settings:signinoptions',
    subtitle: 'PIN, Windows Hello, password',
    aliases: ['pin', 'windows hello', 'password'],
  },
  {
    page: 'time-language',
    label: 'Time & language',
    uri: 'ms-settings:dateandtime',
    subtitle: 'Clock, region, and language',
    aliases: ['date', 'time', 'clock', 'timezone'],
  },
  {
    page: 'language',
    label: 'Language & region',
    uri: 'ms-settings:regionlanguage',
    subtitle: 'Display language and region format',
    aliases: ['locale', 'region', 'language pack'],
  },
  {
    page: 'speech',
    label: 'Speech',
    uri: 'ms-settings:speech',
    subtitle: 'Voice and speech recognition',
    aliases: ['voice', 'dictation'],
  },
  {
    page: 'gaming',
    label: 'Gaming',
    uri: 'ms-settings:gaming-gamebar',
    subtitle: 'Xbox Game Bar and captures',
    aliases: ['game bar', 'xbox', 'game mode'],
  },
  {
    page: 'game-mode',
    label: 'Game Mode',
    uri: 'ms-settings:gaming-gamemode',
    subtitle: 'Optimize PC for gaming',
    aliases: ['game mode settings'],
  },
  {
    page: 'accessibility',
    label: 'Accessibility',
    uri: 'ms-settings:easeofaccess-display',
    subtitle: 'Vision, hearing, and interaction',
    aliases: ['ease of access', 'a11y'],
  },
  {
    page: 'accessibility-color-filters',
    label: 'Color filters',
    uri: 'ms-settings:easeofaccess-colorfilter',
    subtitle: 'Adjust colors for visual accessibility',
    aliases: ['color blind', 'grayscale', 'visual filters'],
  },
  {
    page: 'accessibility-captions',
    label: 'Captions',
    uri: 'ms-settings:easeofaccess-closedcaptioning',
    subtitle: 'Caption appearance and live captions',
    aliases: ['closed captions', 'subtitles', 'live captions'],
  },
  {
    page: 'narrator',
    label: 'Narrator',
    uri: 'ms-settings:easeofaccess-narrator',
    subtitle: 'Screen reader',
    aliases: ['screen reader'],
  },
  {
    page: 'magnifier',
    label: 'Magnifier',
    uri: 'ms-settings:easeofaccess-magnifier',
    subtitle: 'Screen zoom',
    aliases: ['zoom accessibility'],
  },
  {
    page: 'privacy',
    label: 'Privacy & security',
    uri: 'ms-settings:privacy',
    subtitle: 'Permissions and Windows Security',
    aliases: ['privacy', 'security', 'permissions'],
  },
  {
    page: 'privacy-camera',
    label: 'Camera privacy',
    uri: 'ms-settings:privacy-webcam',
    subtitle: 'Which apps can use the camera',
    aliases: ['webcam', 'camera permissions'],
  },
  {
    page: 'privacy-microphone',
    label: 'Microphone privacy',
    uri: 'ms-settings:privacy-microphone',
    subtitle: 'Which apps can use the microphone',
    aliases: ['mic permissions'],
  },
  {
    page: 'windows-update',
    label: 'Windows Update',
    uri: 'ms-settings:windowsupdate',
    subtitle: 'Check for updates',
    aliases: ['update', 'windows update'],
  },
  {
    page: 'windows-security',
    label: 'Windows Security',
    uri: 'ms-settings:windowsdefender',
    subtitle: 'Virus & threat protection',
    aliases: ['defender', 'antivirus', 'firewall'],
  },
  {
    page: 'update-history',
    label: 'Update history',
    uri: 'ms-settings:windowsupdate-history',
    subtitle: 'Review installed Windows updates',
    aliases: ['installed updates', 'patch history'],
  },
  {
    page: 'update-options',
    label: 'Advanced update options',
    uri: 'ms-settings:windowsupdate-options',
    subtitle: 'Update preferences and optional settings',
    aliases: ['advanced windows update', 'update settings'],
  },
  {
    page: 'optional-updates',
    label: 'Optional updates',
    uri: 'ms-settings:windowsupdate-optionalupdates',
    subtitle: 'Driver and optional Windows updates',
    aliases: ['driver updates', 'optional drivers'],
  },
  {
    page: 'troubleshoot',
    label: 'Troubleshoot',
    uri: 'ms-settings:troubleshoot',
    subtitle: 'Recommended troubleshooters',
    aliases: ['fix problems', 'diagnostics'],
  },
  {
    page: 'recovery',
    label: 'Recovery',
    uri: 'ms-settings:recovery',
    subtitle: 'Reset this PC and advanced startup',
    aliases: ['reset pc', 'restore'],
  },
  {
    page: 'activation',
    label: 'Activation',
    uri: 'ms-settings:activation',
    subtitle: 'Windows activation status',
    aliases: ['activate windows', 'product key'],
  },
  {
    page: 'developers',
    label: 'For developers',
    uri: 'ms-settings:developers',
    subtitle: 'Developer Mode and device portal',
    aliases: ['developer mode', 'dev settings'],
  },
  {
    page: 'search',
    label: 'Search permissions',
    uri: 'ms-settings:search',
    subtitle: 'Windows Search privacy and history',
    aliases: ['search settings', 'cortana search'],
  },
  {
    page: 'clipboard',
    label: 'Clipboard',
    uri: 'ms-settings:clipboard',
    subtitle: 'Clipboard history and sync',
    aliases: ['clipboard history'],
  },
  {
    page: 'search-indexing',
    label: 'Searching Windows',
    uri: 'ms-settings:search-moredetails',
    subtitle: 'Indexing status, locations, and search mode',
    aliases: ['indexing options', 'windows index', 'file search', 'search service'],
  },
  {
    page: 'search-permissions',
    label: 'Search permissions',
    uri: 'ms-settings:search-permissions',
    subtitle: 'SafeSearch, cloud search, and search history',
    aliases: ['safe search', 'cloud search', 'search history'],
  },
  {
    page: 'phone',
    label: 'Phone Link',
    uri: 'ms-settings:mobile-devices',
    subtitle: 'Link your Android or iPhone',
    aliases: ['your phone', 'phone link', 'mobile devices'],
  },
] as const

export type SettingsPage = (typeof WINDOWS_SETTINGS_CATALOG)[number]['page']

export const SETTINGS_PAGE_URIS: Record<SettingsPage, string> = Object.fromEntries(
  WINDOWS_SETTINGS_CATALOG.map((entry) => [entry.page, entry.uri])
) as Record<SettingsPage, string>

export const SETTINGS_PAGE_IDS = new Set<string>(WINDOWS_SETTINGS_CATALOG.map((entry) => entry.page))

export function getSupportedWindowsSettingsCatalog(build?: number): readonly WindowsSettingsPageDef[] {
  const windowsBuild = build ?? Number.POSITIVE_INFINITY
  return WINDOWS_SETTINGS_CATALOG.filter(
    (entry) => !entry.deprecated && (!entry.minBuild || windowsBuild >= entry.minBuild)
  )
}

/** Allowlisted protocol used to open Windows Copilot (not freeform). */
export const WINDOWS_COPILOT_URI = 'ms-copilot:'

export function isSettingsPage(value: string): value is SettingsPage {
  return SETTINGS_PAGE_IDS.has(value)
}

export function settingsPageListForError(): string {
  return WINDOWS_SETTINGS_CATALOG.map((entry) => entry.page).join(', ')
}

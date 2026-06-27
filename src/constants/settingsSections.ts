import type { CatalogExtensionId } from '../components/Settings/sections/extensionCatalog'

export type SettingsSectionId =
  | 'usage'
  | 'providers'
  | 'overlay'
  | 'mcp'
  | 'themes'
  | 'systemprompt'

export interface SettingsSectionMeta {
  id: SettingsSectionId
  navLabel: string
  title: string
  description: string
  keywords: string[]
}

export const SETTINGS_SECTIONS: SettingsSectionMeta[] = [
  {
    id: 'usage',
    navLabel: 'Usage',
    title: 'Usage Intelligence',
    description: 'Track activity, model mix, and performance trends in one place.',
    keywords: ['stats', 'analytics', 'tokens', 'activity', 'performance'],
  },
  {
    id: 'providers',
    navLabel: 'Providers',
    title: 'Providers & Models',
    description: 'Configure model providers, API credentials, and search integrations.',
    keywords: ['models', 'openrouter', 'groq', 'perplexity', 'ollama', 'alibaba', 'tavily'],
  },
  {
    id: 'overlay',
    navLabel: 'Extensions',
    title: 'Extensions',
    description: 'Manage desktop add-ons like the Overlay and future extension surfaces.',
    keywords: ['extensions', 'overlay', 'desktop overlay', 'shortcut', 'compact chat'],
  },
  {
    id: 'mcp',
    navLabel: 'MCP',
    title: 'MCP Servers',
    description: 'Configure Model Context Protocol servers, secrets, and connection state.',
    keywords: ['mcp', 'model context protocol', 'server', 'stdio', 'sse', 'websocket', 'tools'],
  },
  {
    id: 'themes',
    navLabel: 'Appearance',
    title: 'Appearance & Personalization',
    description: 'Tailor themes, layout density, and visual behavior.',
    keywords: ['theme', 'style', 'palette', 'titlebar', 'command palette'],
  },
  {
    id: 'systemprompt',
    navLabel: 'Prompt',
    title: 'System Prompt',
    description: 'Define default assistant behavior and response guidelines.',
    keywords: ['instruction', 'persona', 'behavior', 'prompt'],
  },
]

export const SETTINGS_SECTION_MAP: Record<SettingsSectionId, SettingsSectionMeta> =
  SETTINGS_SECTIONS.reduce<Record<SettingsSectionId, SettingsSectionMeta>>((acc, section) => {
    acc[section.id] = section
    return acc
  }, {} as Record<SettingsSectionId, SettingsSectionMeta>)

const SETTINGS_SECTION_ALIASES: Record<string, SettingsSectionId> = {
  tools: 'overlay',
  skills: 'overlay',
  extensions: 'overlay',
  models: 'providers',
  preferences: 'providers',
  servers: 'mcp',
  overlay: 'overlay',
  buddyoverlay: 'overlay',
  commandbar: 'themes',
  notifications: 'overlay',
  email: 'overlay',
  brevo: 'overlay',
  personalization: 'overlay',
  memories: 'overlay',
  memory: 'overlay',
}

export interface ResolvedSettingsNavigation {
  section: SettingsSectionId
  extension?: CatalogExtensionId
  extensionPanel?: 'notifications'
}

const EXTENSION_ROUTE_ALIASES: Record<string, Pick<ResolvedSettingsNavigation, 'extension' | 'extensionPanel'>> = {
  memory: { extension: 'memory' },
  memories: { extension: 'memory' },
  personalization: { extension: 'memory' },
  reminders: { extension: 'reminders' },
  lookouts: { extension: 'reminders' },
  notifications: { extension: 'reminders', extensionPanel: 'notifications' },
  email: { extension: 'reminders', extensionPanel: 'notifications' },
  brevo: { extension: 'reminders', extensionPanel: 'notifications' },
  buddyoverlay: { extension: 'overlay' },
}

export function resolveSettingsNavigation(
  section: string | null | undefined
): ResolvedSettingsNavigation {
  if (!section) return { section: 'providers' }

  const aliasKey = section.trim().toLowerCase()
  const extensionRoute = EXTENSION_ROUTE_ALIASES[aliasKey]
  if (extensionRoute) {
    return { section: 'overlay', ...extensionRoute }
  }

  const normalized = normalizeSettingsSection(section) ?? 'providers'
  return { section: normalized }
}

export function normalizeSettingsSection(section: string | null | undefined): SettingsSectionId | null {
  if (!section) return null
  if (section in SETTINGS_SECTION_ALIASES) {
    return SETTINGS_SECTION_ALIASES[section]
  }
  return section in SETTINGS_SECTION_MAP ? (section as SettingsSectionId) : null
}

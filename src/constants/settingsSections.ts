export type SettingsSectionId =
  | 'usage'
  | 'providers'
  | 'overlay'
  | 'mcp'
  | 'skills'
  | 'notifications'
  | 'memory'
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
    id: 'skills',
    navLabel: 'Skills',
    title: 'Skills & Capabilities',
    description: 'Enable built-in research skills and control tool access behavior.',
    keywords: ['tools', 'research', 'capabilities', 'web search', 'tavily'],
  },
  {
    id: 'notifications',
    navLabel: 'Notifications',
    title: 'Notifications',
    description: 'Configure reminder and lookout email delivery.',
    keywords: ['email', 'brevo', 'notifications', 'reminders', 'lookouts'],
  },
  {
    id: 'memory',
    navLabel: 'Memory',
    title: 'Memory & Personalization',
    description: 'Manage what ZuraAI remembers about you across chats.',
    keywords: ['memory', 'memories', 'personalization', 'remember', 'profile', 'preferences'],
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
  tools: 'skills',
  models: 'providers',
  preferences: 'providers',
  servers: 'mcp',
overlay: 'overlay',
  buddyoverlay: 'overlay',
  commandbar: 'themes',
  notifications: 'notifications',
  email: 'notifications',
  brevo: 'notifications',
  personalization: 'memory',
  memories: 'memory',
}

export function normalizeSettingsSection(section: string | null | undefined): SettingsSectionId | null {
  if (!section) return null
  if (section in SETTINGS_SECTION_ALIASES) {
    return SETTINGS_SECTION_ALIASES[section]
  }
  return section in SETTINGS_SECTION_MAP ? (section as SettingsSectionId) : null
}

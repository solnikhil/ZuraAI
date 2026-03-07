export type SettingsSectionId =
  | 'usage'
  | 'providers'
  | 'skills'
  | 'themes'
  | 'systemprompt'
  | 'experimental'

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
    id: 'skills',
    navLabel: 'Skills',
    title: 'Skills & Capabilities',
    description: 'Enable built-in skills and control tool access behavior.',
    keywords: ['tools', 'research', 'capabilities', 'web search'],
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
  {
    id: 'experimental',
    navLabel: 'Experimental',
    title: 'Experimental Features',
    description: 'Try early capabilities and tune advanced interface behavior.',
    keywords: ['labs', 'beta', 'feature flags', 'frosted'],
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
  commandbar: 'themes',
  notifications: 'usage',
}

export function normalizeSettingsSection(section: string | null | undefined): SettingsSectionId | null {
  if (!section) return null
  if (section in SETTINGS_SECTION_ALIASES) {
    return SETTINGS_SECTION_ALIASES[section]
  }
  return section in SETTINGS_SECTION_MAP ? (section as SettingsSectionId) : null
}

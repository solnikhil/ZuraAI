export type ZuraStoreCategory = 'All' | 'Productivity' | 'Communication' | 'Lifestyle'

export interface ZuraStoreExtension {
  id: string
  name: string
  description: string
  category: Exclude<ZuraStoreCategory, 'All'>
  accent: string
  glyph: string
  featured?: boolean
  capabilities: string[]
}

/**
 * Curated catalogue. GitHub is the first reviewed, bundled product with a real
 * main-owned install state; remaining concepts stay presentation-only.
 */
export const ZURA_STORE_EXTENSIONS: ZuraStoreExtension[] = [
  {
    id: 'spotify',
    name: 'Spotify',
    description: 'Control playback, jump to playlists, and see what is playing.',
    category: 'Lifestyle',
    accent: '#1ed760',
    glyph: 'S',
    featured: true,
    capabilities: ['Playback', 'Library', 'Now playing'],
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Find pages and send quick notes without leaving Command Center.',
    category: 'Productivity',
    accent: '#f4f1eb',
    glyph: 'N',
    capabilities: ['Search', 'Quick capture'],
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    description: 'Check the day ahead and create events from natural language.',
    category: 'Productivity',
    accent: '#4285f4',
    glyph: '31',
    capabilities: ['Agenda', 'Create events'],
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Search conversations and send a message to the right channel.',
    category: 'Communication',
    accent: '#e8a7c6',
    glyph: '#',
    capabilities: ['Search', 'Messages'],
  },
  {
    id: 'github',
    name: 'GitHub Workspace',
    description: 'Review changes, commit, inspect history, and sync repositories in Command Center.',
    category: 'Productivity',
    accent: '#b9b7ff',
    glyph: 'GH',
    capabilities: ['Changes', 'History', 'Commit', 'Sync'],
  },
  {
    id: 'discord',
    name: 'Discord',
    description: 'Move between servers, channels, and unread conversations quickly.',
    category: 'Communication',
    accent: '#8896ff',
    glyph: 'D',
    capabilities: ['Channels', 'Messages'],
  },
]

export const ZURA_STORE_CATEGORIES: ZuraStoreCategory[] = [
  'All',
  'Productivity',
  'Communication',
  'Lifestyle',
]

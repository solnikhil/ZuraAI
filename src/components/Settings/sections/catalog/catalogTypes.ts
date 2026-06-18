export type CatalogSortKey = 'relevance' | 'az' | 'za' | 'capabilities'

export interface CatalogItem<T = unknown> {
  id: string
  displayName: string
  description?: string
  capabilities: string[]
  vendor?: string
  model: T
}

export interface CatalogFilters {
  query: string
  caps: string[]
  sort: CatalogSortKey
  hideAdded: boolean
}

export const DEFAULT_CATALOG_FILTERS: CatalogFilters = {
  query: '',
  caps: [],
  sort: 'relevance',
  hideAdded: true,
}

export const CAPABILITY_CHIP_ORDER: string[] = [
  'vision',
  'toolCall',
  'deepThinking',
  'webSearch',
  'imageGen',
  'videoRec',
]

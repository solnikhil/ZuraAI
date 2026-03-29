export interface WebSearchArgs {
  query: string
  num_results?: number
  search_depth?: 'basic' | 'advanced'
  time_range?: 'day' | 'week' | 'month' | 'year'
  topic?: 'general' | 'news' | 'finance'
  urls?: string[]
}

export interface SearchResult {
  title: string
  url: string
  snippet: string
  raw_content?: string
  favicon?: string
  source?: string
  displayed_link?: string
  date?: string
}

export interface ImageResult {
  url: string
  description?: string
  sourceUrl?: string
}

export interface JsonRecord {
  [key: string]: unknown
}

export interface TavilyExtractFailure {
  error?: string
}

export type WebInputIntent =
  | 'query_search'
  | 'url_extract'
  | 'url_extract_with_query'
  | 'site_exploration'

export interface ClassifiedWebInput {
  intent: WebInputIntent
  urls: string[]
  queryWithoutUrls: string
  originalQuery: string
}

export interface SearchExecutionOptions {
  query: string
  numResults: number
  searchDepth: 'basic' | 'advanced'
  timeRange?: 'day' | 'week' | 'month' | 'year'
  topic?: 'general' | 'news' | 'finance'
}

export interface TavilyExtractArgs {
  urls: string[]
  query?: string
  apiKey: string
  intent: WebInputIntent
}

import type { ConfiguredModel } from '../contexts/SettingsConfigContext'
import { getProviderEndpoint } from '../providers'

export interface PerplexityCatalogModel {
  id: string
  displayName: string
  description?: string
  category?: 'search' | 'reasoning' | 'research'
  maxContext?: number
  supportsWebSearch?: boolean
  supportsDeepThinking?: boolean
  supportsToolCall?: boolean
  supportsVision?: boolean
}

const PERPLEXITY_MODEL_CATALOG_URL =
  getProviderEndpoint('perplexity', 'modelCatalogUrl') ??
  'https://docs.perplexity.ai/api-reference/sonar-post'

const SONAR_MODEL_TOKEN_PATTERN = /\bsonar(?:-[a-z]+(?:-[a-z]+)*)?\b/gi
const BACKTICK_TOKEN_PATTERN = /`([^`]+)`/g

function normalizeSearchText(value: string | undefined): string {
  if (!value) return ''

  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function titleCaseSegment(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function buildDisplayName(modelId: string): string {
  return modelId
    .split('-')
    .map((segment) => {
      if (segment.toLowerCase() === 'pro') return 'Pro'
      return titleCaseSegment(segment)
    })
    .join(' ')
}

function inferDescription(modelId: string): string {
  if (modelId.includes('deep-research')) {
    return 'Exhaustive multi-source research model with native web search.'
  }
  if (modelId.includes('reasoning')) {
    return 'Reasoning-focused Sonar model with native web search.'
  }
  if (modelId === 'sonar-pro') {
    return 'Higher-capability Sonar model for research-oriented conversations.'
  }
  return 'Search-native Sonar model for fast web-connected answers.'
}

function inferCategory(modelId: string): PerplexityCatalogModel['category'] {
  if (modelId.includes('deep-research')) return 'research'
  if (modelId.includes('reasoning')) return 'reasoning'
  return 'search'
}

function inferSupportsDeepThinking(modelId: string): boolean {
  return /reasoning|deep-research/i.test(modelId)
}

function extractSonarModelIds(source: string): string[] {
  const discovered = new Set<string>()

  for (const match of source.matchAll(BACKTICK_TOKEN_PATTERN)) {
    const candidate = (match[1] ?? '').trim().toLowerCase()
    if (candidate.includes('/')) continue
    if (!/^sonar(?:-[a-z]+(?:-[a-z]+)*)?$/.test(candidate)) continue
    discovered.add(candidate)
  }

  if (discovered.size > 0) {
    return [...discovered]
  }

  const normalizedSource = source.replace(/\s+/g, ' ')
  const availableOptionsSegments =
    normalizedSource.match(/Available options:\s*[^]+?(?=\s[a-z][A-Za-z]+(?:\s|$)|$)/g) ?? []

  for (const segment of availableOptionsSegments) {
    for (const match of segment.matchAll(SONAR_MODEL_TOKEN_PATTERN)) {
      const candidate = (match[0] ?? '').trim().toLowerCase()
      if (!candidate) continue

      const matchIndex = match.index ?? -1
      if (matchIndex > 0 && segment[matchIndex - 1] === '/') continue

      discovered.add(candidate)
    }
  }

  return [...discovered]
}

function compareModelIds(a: string, b: string): number {
  if (a === 'sonar') return -1
  if (b === 'sonar') return 1
  if (a === 'sonar-pro') return -1
  if (b === 'sonar-pro') return 1
  if (a === 'sonar-reasoning-pro') return -1
  if (b === 'sonar-reasoning-pro') return 1
  if (a === 'sonar-deep-research') return -1
  if (b === 'sonar-deep-research') return 1
  return a.localeCompare(b)
}

export async function fetchPerplexityModels(apiKey: string): Promise<PerplexityCatalogModel[]> {
  if (!apiKey?.trim()) {
    throw new Error('Perplexity API key is required to fetch catalog models.')
  }

  const response = await fetch(PERPLEXITY_MODEL_CATALOG_URL, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'text/html, text/plain;q=0.9, application/json;q=0.8',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch Perplexity models: ${response.status} ${response.statusText}`)
  }

  const source = await response.text()
  const modelIds = extractSonarModelIds(source).sort(compareModelIds)

  if (modelIds.length === 0) {
    throw new Error('Perplexity catalog did not expose any Sonar models in the expected format.')
  }

  return modelIds.map((id) => {
    const supportsDeepThinking = inferSupportsDeepThinking(id)

    return {
      id,
      displayName: buildDisplayName(id),
      description: inferDescription(id),
      category: inferCategory(id),
      maxContext: 128000,
      supportsWebSearch: true,
      supportsDeepThinking,
      supportsToolCall: false,
      supportsVision: false,
    }
  })
}

export function mapPerplexityModelToConfiguredModel(
  apiModel: PerplexityCatalogModel
): ConfiguredModel {
  const supportsDeepThinking = Boolean(apiModel.supportsDeepThinking)

  return {
    code: apiModel.id,
    displayName: apiModel.displayName,
    description: apiModel.description,
    maxContext: apiModel.maxContext,
    modelType: supportsDeepThinking ? 'reasoning' : 'chat',
    supportsToolCall: false,
    supportsVision: false,
    supportsDeepThinking,
    supportsWebSearch: apiModel.supportsWebSearch !== false,
  }
}

export function searchPerplexityModels(
  models: PerplexityCatalogModel[],
  query: string
): PerplexityCatalogModel[] {
  if (!query.trim()) return models

  const normalizedQuery = normalizeSearchText(query)
  const queryTokens = normalizedQuery.split(' ').filter(Boolean)

  return models.filter((model) => {
    const haystack = normalizeSearchText(
      [model.id, model.displayName, model.description, model.category].filter(Boolean).join(' ')
    )

    return (
      haystack.includes(normalizedQuery) || queryTokens.every((token) => haystack.includes(token))
    )
  })
}

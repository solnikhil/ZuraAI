import { SEARCH_EXTRACT_SNIPPET_LENGTH } from './constants'
import type {
  ImageResult,
  JsonRecord,
  SearchResult,
  TavilyExtractFailure,
} from './types'

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function getString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function compactMap<TInput, TOutput>(
  items: readonly TInput[],
  mapper: (item: TInput) => TOutput | null
): TOutput[] {
  const mapped: TOutput[] = []

  for (const item of items) {
    const result = mapper(item)
    if (result !== null) {
      mapped.push(result)
    }
  }

  return mapped
}

export function getFailureMessage(failures: readonly unknown[]): string {
  const [firstFailure] = compactMap(failures, (failure): TavilyExtractFailure | null => {
    if (!isRecord(failure)) return null
    return { error: getString(failure.error) || undefined }
  })

  return firstFailure?.error ? ` ${firstFailure.error}` : ''
}

export function getFaviconUrl(url: string): string {
  try {
    const domain = new URL(url).hostname
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
  } catch {
    return ''
  }
}

export function getSourceFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

export function getDisplayedLink(url: string): string {
  try {
    const urlObj = new URL(url)
    const hostname = urlObj.hostname.replace(/^www\./, '')
    const pathname = urlObj.pathname

    if (pathname === '/' || !pathname) {
      return hostname
    }

    const pathParts = pathname
      .split('/')
      .filter((part) => part && part !== 'index.html' && part !== 'index')
      .slice(0, 2)

    if (pathParts.length === 0) {
      return hostname
    }

    return `${hostname} > ${pathParts.join(' > ')}`
  } catch {
    return url
  }
}

export function buildSnippetFromRawContent(rawContent: string): string {
  const flattened = rawContent.replace(/\s+/g, ' ').trim()

  if (!flattened) return ''
  if (flattened.length <= SEARCH_EXTRACT_SNIPPET_LENGTH) return flattened
  return `${flattened.slice(0, SEARCH_EXTRACT_SNIPPET_LENGTH - 3)}...`
}

export function inferTitleFromRawContent(rawContent: string, url: string): string {
  const candidate = rawContent
    .split('\n')
    .map((line) => line.trim())
    .map((line) => line.replace(/^#{1,6}\s+/, '').trim())
    .find((line) => line.length >= 3 && line.length <= 140)

  if (candidate) {
    return candidate
  }

  return getDisplayedLink(url)
}

export function parseTavilyExtractResult(result: unknown): SearchResult | null {
  if (!isRecord(result)) return null

  const url = getString(result.url)
  if (!url) return null

  const rawContent = getString(result.raw_content)

  return {
    title: inferTitleFromRawContent(rawContent, url),
    url,
    snippet: buildSnippetFromRawContent(rawContent),
    raw_content: rawContent || undefined,
    favicon: getString(result.favicon).trim() || getFaviconUrl(url),
    source: getSourceFromUrl(url),
    displayed_link: getDisplayedLink(url),
  }
}

export function parseTavilyImage(image: unknown, sourceUrl?: string): ImageResult | null {
  if (typeof image === 'string') {
    return image ? { url: image, sourceUrl } : null
  }

  if (!isRecord(image)) return null

  const imageUrl = getString(image.url)
  if (!imageUrl) return null

  const description = getString(image.description) || getString(image.alt) || undefined
  return {
    url: imageUrl,
    description,
    sourceUrl,
  }
}

export function extractTavilyImages(results: readonly unknown[]): ImageResult[] {
  const images: ImageResult[] = []
  const imageSet = new Set<string>()

  for (const result of results) {
    if (!isRecord(result)) continue

    const sourceUrl = getString(result.url) || undefined
    const sourceImages = Array.isArray(result.images) ? result.images : []

    for (const image of sourceImages) {
      const parsed = parseTavilyImage(image, sourceUrl)
      if (!parsed || imageSet.has(parsed.url)) continue
      imageSet.add(parsed.url)
      images.push(parsed)
    }
  }

  return images
}

export function parseTavilySearchResult(result: unknown): SearchResult | null {
  if (!isRecord(result)) return null

  const url = getString(result.url)
  if (!url) return null

  return {
    title: getString(result.title),
    url,
    snippet: getString(result.content),
    favicon: getFaviconUrl(url),
    source: getSourceFromUrl(url),
    displayed_link: getDisplayedLink(url),
    date: getString(result.published_date) || getString(result.date) || undefined,
  }
}

export function parseDuckDuckScrapeResult(result: unknown): SearchResult | null {
  if (!isRecord(result)) return null

  const url = getString(result.url)
  if (!url) return null

  return {
    title: getString(result.title) || url,
    url,
    snippet: getString(result.description) || getString(result.rawDescription),
    favicon: getFaviconUrl(url),
    source: getSourceFromUrl(url),
    displayed_link: getDisplayedLink(url),
  }
}

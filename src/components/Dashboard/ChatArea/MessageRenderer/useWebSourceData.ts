import { useMemo, useCallback } from 'react'
import type { ToolCallResult } from '@/contexts/ChatHistoryContext'
import type { WebSource } from '../WebSourceCitation'
import { inferWebToolModeFromResultData } from '@/tools/ui/webToolDisplay'
import {
  convertUrlsToMarkdownLinks,
  convertNumericCitationsToMarkdownLinks,
  stripReferencesSection,
} from './messageContentProcessing'

/**
 * Builds a web source map and ordered URL list from tool results,
 * and provides a content processing function that converts URLs
 * and numeric citations into markdown links.
 */
export function useWebSources(toolResults?: ToolCallResult[]) {
  const { webSourceMap, orderedWebSourceUrls } = useMemo(() => {
    const map = new Map<string, WebSource>()
    const orderedUrls: string[] = []
    if (!toolResults) {
      return { webSourceMap: map, orderedWebSourceUrls: orderedUrls }
    }

    for (const tr of toolResults) {
      if (tr.toolCall.name === 'web_search' && tr.result?.success && tr.result?.data) {
        const dataObj = tr.result.data as Record<string, unknown>
        const results = (dataObj.results as unknown[]) || tr.result.data
        if (Array.isArray(results)) {
          for (const rawEntry of results) {
            const entry = rawEntry as Record<string, unknown>
            if (entry.url) {
              const url = String(entry.url)
              if (!map.has(url)) {
                orderedUrls.push(url)
              }
              map.set(String(entry.url), {
                title: String(entry.title || ''),
                url,
                snippet: String(entry.snippet || entry.description || ''),
                favicon: String(entry.favicon || ''),
              })
            }
          }
        }
      }
    }
    return { webSourceMap: map, orderedWebSourceUrls: orderedUrls }
  }, [toolResults])

  const processMessageContent = useCallback(
    (content: string) => {
      if (!content.trim()) {
        return ''
      }

      const withUrlLinks = convertUrlsToMarkdownLinks(content)
      const withCitations = convertNumericCitationsToMarkdownLinks(withUrlLinks, orderedWebSourceUrls)
      return orderedWebSourceUrls.length > 0 ? stripReferencesSection(withCitations) : withCitations
    },
    [orderedWebSourceUrls]
  )

  return { webSourceMap, orderedWebSourceUrls, processMessageContent }
}

/**
 * Extracts images from web_search tool results.
 */
export function useWebSearchImages(
  toolResults?: ToolCallResult[],
  includeImages?: boolean
) {
  return useMemo(() => {
    const images: Array<{ url: string; description?: string; mode: 'search' | 'extract' }> = []
    if (includeImages === false || !toolResults) {
      return { webSearchImages: images, webImageMode: 'search' as const }
    }

    const modeSet = new Set<'search' | 'extract'>()

    for (const tr of toolResults) {
      if (tr.toolCall.name === 'web_search' && tr.result?.success && tr.result?.data) {
        const dataObj = tr.result.data as Record<string, unknown>
        const mode = inferWebToolModeFromResultData(dataObj) || 'search'
        modeSet.add(mode)
        const resultImages = (dataObj.images as unknown[]) || []
        if (Array.isArray(resultImages)) {
          for (const img of resultImages) {
            if (typeof img === 'string') {
              images.push({ url: img, mode })
            } else if (img && typeof img === 'object') {
              const imgObj = img as Record<string, unknown>
              if (imgObj.url) {
                images.push({
                  url: String(imgObj.url),
                  description: String(imgObj.description || imgObj.alt || '') || undefined,
                  mode,
                })
              }
            }
          }
        }
      }
    }

    const webImageMode: 'search' | 'extract' | 'mixed' =
      modeSet.size > 1 ? 'mixed' : modeSet.values().next().value || 'search'

    return { webSearchImages: images, webImageMode }
  }, [toolResults, includeImages])
}

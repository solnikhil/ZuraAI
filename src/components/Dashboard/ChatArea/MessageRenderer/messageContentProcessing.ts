/**
 * Pure utility functions for processing message content.
 * Handles URL conversion, citation linking, and reference section stripping.
 */

import { normalizeSafeHttpUrl } from '@/utils/urlSafety'

function isReferenceHeading(block: string): boolean {
  return /^(?:#{1,4}\s*)?(?:\*{1,2})?(?:References|Sources)(?:\*{1,2})?:?\s*$/i.test(block.trim())
}

function getInlineReferenceSectionBody(block: string): string | null {
  const match = block
    .trim()
    .match(/^(?:#{1,4}\s*)?(?:\*{1,2})?(?:References|Sources)(?:\*{1,2})?:\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

function isGeneratedSourceEntry(entry: string): boolean {
  const text = entry.trim()
  if (!text) return false

  return (
    /https?:\/\//i.test(text) ||
    /^\[[^\]]{2,}\]\([^)]+\)/.test(text) ||
    /^.{3,}?\s[-\u2013\u2014]\s.{3,}$/s.test(text)
  )
}

function isCompactGeneratedReferenceSection(block: string): boolean {
  const body = getInlineReferenceSectionBody(block)
  if (!body || !body.includes('|')) {
    return false
  }

  const entries = body
    .split(/\s+\|\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean)

  return entries.length >= 2 && entries.every(isGeneratedSourceEntry)
}

function isGeneratedSourceBlock(block: string): boolean {
  const text = block.trim()
  if (!text) return false

  return (
    isCompactGeneratedReferenceSection(text) ||
    /https?:\/\//i.test(text) ||
    /\[\[?\d+\]?\](?:\([^)]+\))?/.test(text) ||
    /\b(?:GitHub|Docs?|Documentation|Stack Overflow|Wikipedia)\b/i.test(text) ||
    /^.{8,}?\s[-–—]\s.{8,}$/s.test(text)
  )
}

function stripCompactReferenceLines(content: string): string {
  return content
    .split('\n')
    .filter((line) => !isCompactGeneratedReferenceSection(line))
    .join('\n')
    .trimEnd()
}

function stripGeneratedReferenceBlocks(content: string): string {
  const parts = content.split(/(\n{2,})/)
  const kept: string[] = []

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index]

    if (!isReferenceHeading(part)) {
      kept.push(part)
      continue
    }

    if (kept.length > 0 && /^\n{2,}$/.test(kept[kept.length - 1])) {
      kept.pop()
    }
    let cursor = index + 1
    if (/^\n{2,}$/.test(parts[cursor] ?? '')) {
      cursor += 1
    }

    while (cursor < parts.length && isGeneratedSourceBlock(parts[cursor] ?? '')) {
      cursor += 1
      if (/^\n{2,}$/.test(parts[cursor] ?? '')) {
        cursor += 1
      }
    }

    index = cursor - 1
  }

  return kept.join('').trimEnd()
}

/**
 * Strip trailing "References" or "Sources" sections that the model may generate.
 * These are redundant because the app renders numbered citations as interactive links.
 * Matches a heading (e.g. "## References", "**References**", "References") followed by
 * generated source entries until the end of the content.
 */
export function stripReferencesSection(content: string): string {
  if (!content) return content
  return stripCompactReferenceLines(stripGeneratedReferenceBlocks(content))
    .replace(
      /\n+(?:#{1,4}\s*)?(?:\*{1,2})?(?:References|Sources)(?:\*{1,2})?:?\s*\n+(?:\s*\[?\d+\]?[\s.:\-–—].+(?:\n|$))+$/i,
      ''
    )
    .replace(
      /\n+(?:#{1,4}\s*)?(?:\*{1,2})?(?:References|Sources)(?:\*{1,2})?:?\s+(?:\[\[?\d+\]?\]\([^)]+\)|\[\d+\])[\s\S]*$/i,
      ''
    )
    .replace(
      /\n+(?:#{1,4}\s*)?(?:\*{1,2})?(?:References|Sources)(?:\*{1,2})?:?\s*\n+(?=[\s\S]*(?:https?:\/\/|\[\[?\d+\]?|(?:\s[-–—]\s)|\b(?:GitHub|Docs?|Documentation|Stack Overflow|Wikipedia)\b))[\s\S]*$/i,
      ''
    )
    .trimEnd()
}

/**
 * Convert reference-style URLs to markdown links.
 * Skips URLs inside fenced code blocks and inline code spans.
 */
export function convertUrlsToMarkdownLinks(content: string): string {
  if (!content) return content

  // Split by fenced code blocks first — preserve them untouched
  const fencedParts = content.split(/(```[\s\S]*?```)/g)

  const processed = fencedParts
    .map((part, fIdx) => {
      // Odd indices are fenced code blocks — skip
      if (fIdx % 2 === 1) return part

      // Split by inline code spans — preserve them untouched
      const inlineParts = part.split(/(`[^`]+`)/g)

      return inlineParts
        .map((seg, iIdx) => {
          // Odd indices are inline code spans — skip
          if (iIdx % 2 === 1) return seg

          return convertUrlsInText(seg)
        })
        .join('')
    })
    .join('')

  return processed
}

/** Apply URL→link conversion to a plain-text (non-code) segment */
function convertUrlsInText(text: string): string {
  // Pattern 1: Reference-style URLs like [1] https://example.com
  const result = text.replace(
    /(^|\s)\[(\d+)\]\s+(https?:\/\/[^\s)\][`]+)/gm,
    (_match, prefix, num, url) => {
      const cleanUrl = normalizeSafeHttpUrl(url.replace(/[.,;:!?]+$/, ''))
      return cleanUrl ? `${prefix}[[${num}]](${cleanUrl})` : `${prefix}[${num}] ${url}`
    }
  )

  // Pattern 2: References section format
  const lines = result.split('\n')
  const processedLines = lines.map((line) => {
    if (line.includes('](') && line.includes(')')) return line

    const refMatch = line.match(/^(\s*)\[(\d+)\]\s+(https?:\/\/.+)$/)
    if (refMatch) {
      const [, indent, num, url] = refMatch
      const cleanUrl = normalizeSafeHttpUrl(url.trim().replace(/[.,;:!?]+$/, ''))
      return cleanUrl ? `${indent}[[${num}]](${cleanUrl})` : line
    }

    // Pattern 3: Plain URLs (exclude backticks from URL chars)
    const urlRegex = /(https?:\/\/[^\s)\][`]+)/g
    let lastIndex = 0
    let lineResult = ''

    let match
    while ((match = urlRegex.exec(line)) !== null) {
      lineResult += line.substring(lastIndex, match.index)
      const beforeUrl = line.substring(0, match.index)
      const afterUrl = line.substring(match.index + match[0].length)

      if (beforeUrl.endsWith('](') || afterUrl.startsWith(')')) {
        lineResult += match[0]
      } else {
        const cleanUrl = normalizeSafeHttpUrl(match[0].replace(/[.,;:!?]+$/, ''))
        lineResult += cleanUrl ? `<${cleanUrl}>` : match[0]
      }
      lastIndex = match.index + match[0].length
    }
    lineResult += line.substring(lastIndex)
    return lineResult
  })

  return processedLines.join('\n')
}

/**
 * Convert numeric citations like [1] or [2,3] to markdown links
 * using the ordered URLs from web search results.
 */
export function convertNumericCitationsToMarkdownLinks(
  content: string,
  orderedSourceUrls: string[]
): string {
  if (!content || orderedSourceUrls.length === 0) return content

  const parts = content.split(/(```[\s\S]*?```)/g)

  return parts
    .map((part, index) => {
      // Keep fenced code blocks unchanged
      if (index % 2 === 1) return part

      return part.replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, (match, refs, offset, sourceText) => {
        const prevChar = offset > 0 ? sourceText[offset - 1] : ''
        const nextChar = sourceText[offset + match.length] || ''

        // Skip markdown links like [text](url) and already-converted forms like [[1]](url)
        if (nextChar === '(' || prevChar === '[') return match

        const refNumbers = String(refs)
          .split(',')
          .map((s) => Number.parseInt(s.trim(), 10))

        if (refNumbers.some((n) => !Number.isInteger(n) || n < 1 || n > orderedSourceUrls.length)) {
          return match
        }

        const safeLinks = refNumbers.map((n) =>
          normalizeSafeHttpUrl(orderedSourceUrls[n - 1] || '')
        )
        if (safeLinks.some((link) => !link)) {
          return match
        }

        return safeLinks.map((link, index) => `[[${refNumbers[index]}]](${link})`).join(', ')
      })
    })
    .join('')
}

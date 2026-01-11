/**
 * Centralized text processing utilities for Zura AI
 * Consolidates duplicate text-related functions from Settings.tsx and ModelSelector.tsx
 * 
 * @module textUtils
 * Requirements: 4.2
 */

/**
 * Remove emoji characters from text
 * Used for clean model name display and text sanitization
 * 
 * @param text - Input text that may contain emojis
 * @returns Text with all emoji characters removed
 */
export function removeEmojis(text: string): string {
  if (!text) return ''
  
  return text
    // Emoticons
    .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
    // Miscellaneous Symbols and Pictographs
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
    // Transport and Map Symbols
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
    // Flags
    .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '')
    // Miscellaneous Symbols
    .replace(/[\u{2600}-\u{26FF}]/gu, '')
    // Dingbats
    .replace(/[\u{2700}-\u{27BF}]/gu, '')
    // Variation Selectors
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
    // Supplemental Symbols and Pictographs
    .replace(/[\u{1F900}-\u{1F9FF}]/gu, '')
    // Chess Symbols
    .replace(/[\u{1FA00}-\u{1FA6F}]/gu, '')
    // Symbols and Pictographs Extended-A
    .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '')
    .trim()
}

/**
 * Truncate text with ellipsis
 * 
 * @param text - Input text to truncate
 * @param maxLength - Maximum length before truncation
 * @param ellipsis - Ellipsis string to append (default: '...')
 * @returns Truncated text with ellipsis if needed
 */
export function truncateText(
  text: string,
  maxLength: number,
  ellipsis: string = '...'
): string {
  if (!text) return ''
  if (text.length <= maxLength) return text
  
  // Ensure we don't cut in the middle of a word if possible
  const truncated = text.slice(0, maxLength - ellipsis.length)
  const lastSpace = truncated.lastIndexOf(' ')
  
  // If there's a space in the last 20% of the truncated text, cut at the word boundary
  if (lastSpace > maxLength * 0.8) {
    return truncated.slice(0, lastSpace) + ellipsis
  }
  
  return truncated + ellipsis
}

/**
 * Sanitize text for display
 * Removes control characters and normalizes whitespace
 * 
 * @param text - Input text to sanitize
 * @returns Sanitized text safe for display
 */
export function sanitizeDisplayText(text: string): string {
  if (!text) return ''
  
  return text
    // Remove control characters (except newlines and tabs)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Normalize multiple spaces to single space
    .replace(/  +/g, ' ')
    // Normalize multiple newlines to double newline
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Capitalize the first letter of a string
 * 
 * @param text - Input text
 * @returns Text with first letter capitalized
 */
export function capitalizeFirst(text: string): string {
  if (!text) return ''
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * Convert a string to title case
 * 
 * @param text - Input text
 * @returns Text in title case
 */
export function toTitleCase(text: string): string {
  if (!text) return ''
  return text
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Extract model name from a full model path/code
 * e.g., "openai/gpt-4-turbo" -> "gpt-4-turbo"
 * 
 * @param modelCode - Full model code or path
 * @returns Extracted model name
 */
export function extractModelName(modelCode: string): string {
  if (!modelCode) return ''
  const parts = modelCode.split('/')
  return parts[parts.length - 1] || modelCode
}

/**
 * Format a number with thousand separators
 * 
 * @param num - Number to format
 * @param locale - Locale for formatting (default: 'en-US')
 * @returns Formatted number string
 */
export function formatNumber(num: number, locale: string = 'en-US'): string {
  return new Intl.NumberFormat(locale).format(num)
}

/**
 * Format bytes to human readable string
 * 
 * @param bytes - Number of bytes
 * @param decimals - Number of decimal places (default: 2)
 * @returns Human readable string (e.g., "1.5 MB")
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

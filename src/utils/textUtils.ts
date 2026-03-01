/**
 * Centralized text processing utilities for Zura AI
 * 
 * @module textUtils
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

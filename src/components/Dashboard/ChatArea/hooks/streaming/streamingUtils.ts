/**
 * Shared utilities for streaming hooks
 */

/** Strip standalone --- (markdown horizontal rule) from content when web search was used - shows Web Search block instead */
export function stripStandaloneHorizontalRule(content: string): string {
  if (!content || !content.trim()) return content
  return content
    .replace(/\n\s*---\s*\n?\s*$/g, '\n')  // trailing ---
    .replace(/^\s*---\s*\n?\s*/g, '')       // leading ---
    .trimEnd()
}

/**
 * Parses AI response content to extract thinking/reasoning sections from the final answer.
 *
 * Supports multiple formats:
 * 1. XML-style tags: <think>...</think> or <redacted_reasoning>...</redacted_reasoning>
 * 2. Markdown format: **Thinking...** followed by content, then **Final Answer:**
 * 3. Just **Final Answer:** without explicit thinking marker (treats everything before as thinking)
 *
 * @param rawContent - The raw AI response content
 * @returns An object with thinking (optional) and answer properties
 */
export function parseThinkingContent(rawContent: string): {
  thinking: string | undefined
  answer: string
} {
  if (!rawContent || !rawContent.trim()) {
    return { thinking: undefined, answer: rawContent }
  }

  // Pattern 1: XML-style tags <think>...</think> or <redacted_reasoning>...</redacted_reasoning>
  const xmlTagMatch = rawContent.match(
    /<(?:think|redacted_reasoning)>([\s\S]*?)<\/(?:think|redacted_reasoning)>/i
  )
  if (xmlTagMatch) {
    const thinkingContent = xmlTagMatch[1].trim()
    const answerContent = rawContent
      .replace(/<(?:think|redacted_reasoning)>[\s\S]*?<\/(?:think|redacted_reasoning)>/i, '')
      .trim()

    return {
      thinking: thinkingContent || undefined,
      answer: answerContent || rawContent,
    }
  }

  // Pattern 2: "**Thinking...**" followed by content, then "**Final Answer:**"
  // More flexible regex that handles various markdown formats
  const thinkingMarkerRegex = /(\*\*)?Thinking\.\.\.?(\*\*)?/i
  const finalAnswerRegex = /(\*\*)?Final\s+Answer:?(\*\*)?/i

  const thinkingIndex = rawContent.search(thinkingMarkerRegex)
  const finalAnswerIndex = rawContent.search(finalAnswerRegex)

  if (thinkingIndex !== -1) {
    // Extract thinking content (from after "Thinking..." marker to "Final Answer:" or end)
    const thinkingStart =
      rawContent.indexOf(rawContent.match(thinkingMarkerRegex)?.[0] || 'Thinking', thinkingIndex) +
      (rawContent.match(thinkingMarkerRegex)?.[0]?.length || 0)
    const thinkingEnd = finalAnswerIndex !== -1 ? finalAnswerIndex : rawContent.length

    let thinkingContent = rawContent.substring(thinkingStart, thinkingEnd).trim()

    // Clean up thinking content
    thinkingContent = thinkingContent
      .replace(/^[-=]{3,}\s*/gm, '') // Remove separator lines
      .replace(/[-=]{3,}\s*$/gm, '')
      .replace(/^\*\*Thinking\.\.\.?\*\*\s*/i, '')
      .replace(/^Thinking\.\.\.?\s*/i, '')
      .trim()

    // Extract answer content
    let answerContent: string
    if (finalAnswerIndex !== -1) {
      const finalAnswerMatch = rawContent.match(finalAnswerRegex)
      const answerStart = finalAnswerIndex + (finalAnswerMatch?.[0]?.length || 0)
      answerContent = rawContent.substring(answerStart).trim()
    } else {
      // No Final Answer marker - try to find where thinking ends naturally
      // Look for double newline or significant content change
      const afterThinking = rawContent.substring(thinkingEnd)
      const naturalBreak = afterThinking.search(/\n\n+[A-Z]|\n\n+\d+\.|\n\n+\*\*/)
      answerContent =
        naturalBreak !== -1
          ? afterThinking.substring(naturalBreak).replace(/^\n+/, '').trim()
          : afterThinking.trim()

      // If still empty or same as raw, use raw content but remove thinking section
      if (!answerContent || answerContent === rawContent) {
        answerContent = rawContent
          .replace(new RegExp(`.*?${thinkingMarkerRegex.source}[\\s\\S]*?(?=\\n\\n|$)`, 'i'), '')
          .trim()
      }
    }

    if (!answerContent || answerContent === rawContent) {
      answerContent =
        rawContent
          .replace(new RegExp(`.*?${thinkingMarkerRegex.source}[\\s\\S]*?(?=\\n\\n|$)`, 'i'), '')
          .trim() || rawContent
    }

    return {
      thinking: thinkingContent || undefined,
      answer: answerContent || rawContent,
    }
  }

  // Pattern 3: Just "Final Answer:" without explicit thinking marker
  // Treat everything before as thinking
  if (finalAnswerIndex !== -1) {
    const finalAnswerMatch = rawContent.match(finalAnswerRegex)
    const answerStart = finalAnswerIndex + (finalAnswerMatch?.[0]?.length || 0)
    const thinkingPart = rawContent.substring(0, finalAnswerIndex).trim()
    const answerPart = rawContent.substring(answerStart).trim()

    const cleanThinking = thinkingPart
      .replace(/^[-=]{3,}\s*/gm, '')
      .replace(/[-=]{3,}\s*$/gm, '')
      .replace(/\*\*Thinking\.\.\.?\*\*/gi, '')
      .replace(/^Thinking\.\.\.?\s*/gim, '')
      .trim()

    return {
      thinking: cleanThinking || undefined,
      answer: answerPart || rawContent,
    }
  }

  // No thinking format detected
  return { thinking: undefined, answer: rawContent }
}

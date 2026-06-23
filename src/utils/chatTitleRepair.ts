import type { ChatSession } from '../chat/types'

const FIRST_MESSAGE_TITLE_MAX_CHARS = 30

const BAD_GENERATED_TITLE_PATTERNS: RegExp[] = [
  /^\s*(?:please\s+)?(?:generate|create|make|give)\s+(?:a\s+)?(?:short\s+|descriptive\s+)*title\b/i,
  /^\s*(?:hey|hi|hello)(?:\s+there)?\b/i,
  /\bhow\s+can\s+i\s+help(?:\s+you)?\b/i,
  /\bwhat\s+can\s+i\s+do\s+for\s+you\b/i,
  /\b(?:ready|happy|glad)\s+to\s+help\b/i,
  /^\s*(?:we\s+are\s+(?:given|asked)|we\s+need\s+to|the\s+user\s+(?:asks|asked|said|says|wants)|user\s+(?:asks|asked|said|says|wants))\b/i,
  /\b(?:the\s+)?(?:prompt|conversation|user\s+message)\s+(?:is|asks|says|contains)\b/i,
  /^\s*(?:i(?:'m| am)\s+sorry|sorry\b|apolog(?:y|ize|ise|ies)\b)/i,
  /\b(?:api\s*key|unauthorized|forbidden|rate\s*limit|error|failed|failure)\b/i,
  /\b(?:cannot|can't|unable\s+to|does\s+not\s+support|do\s+not\s+have\s+access)\b/i,
  /^\s*(?:\[|{)/,
  /^\s*```/,
  /<\/?[a-z][\s\S]*>/i,
]

export function isLikelyBadGeneratedTitle(title: string): boolean {
  return BAD_GENERATED_TITLE_PATTERNS.some((pattern) => pattern.test(title))
}

export function makeFirstMessageFallbackTitle(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (!normalized) return 'New Chat'

  return (
    normalized.slice(0, FIRST_MESSAGE_TITLE_MAX_CHARS) +
    (normalized.length > FIRST_MESSAGE_TITLE_MAX_CHARS ? '...' : '')
  )
}

export function repairPersistedChatTitles(sessions: ChatSession[]): {
  sessions: ChatSession[]
  changed: boolean
} {
  let changed = false

  const repairedSessions = sessions.map((session) => {
    if (!isLikelyBadGeneratedTitle(session.title)) {
      return session
    }

    const firstUserMessage = session.messages.find((message) => message.role === 'user')
    const fallbackTitle = makeFirstMessageFallbackTitle(firstUserMessage?.content || '')
    if (fallbackTitle === session.title) {
      return session
    }

    changed = true
    return {
      ...session,
      title: fallbackTitle,
    }
  })

  return { sessions: changed ? repairedSessions : sessions, changed }
}

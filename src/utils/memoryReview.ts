const REMINDER_OR_LOOKOUT_PATTERNS = [
  /\bremind(?:ed|er|ers|s|ing)?\b/i,
  /\bremember\s+to\b/i,
  /\balarm(?:s)?\b/i,
  /\bfollow[-\s]?up(?:s)?\b/i,
  /\bcheck[-\s]?in(?:s)?\b/i,
  /\bscheduled?\s+(?:task|tasks|item|items|reminder|reminders|check|checks)\b/i,
  /\b(?:notify|notification|notifications)\b/i,
  /\b(?:due|deadline)\s+(?:at|by|on|tomorrow|today|next|in)\b/i,
  /\b(?:tomorrow|today|tonight|next\s+\w+|every\s+\w+|daily|weekly|monthly)\b.*\b(?:remind|alarm|notify|follow[-\s]?up|check)\b/i,
  /\b(?:watch|monitor|track|check)\b.*\b(?:url|page|site|website|webpage|link|https?:\/\/|changes?|changed|updates?)\b/i,
  /\b(?:url|page|site|website|webpage|link|https?:\/\/)\b.*\b(?:watch|monitor|track|check|changes?|changed|updates?)\b/i,
  /\bweb\s+lookout(?:s)?\b/i,
  /\blookout(?:s)?\b.*\b(?:changed?|changes?|page|url|site|website)\b/i,
  /\bchange\s+detection\b/i,
  /\bscheduled_task_[a-z_]+\b/i,
]

const DURABLE_USER_CONTEXT_PATTERNS = [
  /\bI\s+(?:am|work|study|live|prefer|like|use|build|maintain|run|own|manage|lead|write|design)\b/i,
  /\bmy\s+(?:name|role|job|work|project|app|company|team|preference|goal|workflow|stack)\b/i,
  /\buser\s+(?:is|works|studies|lives|prefers|likes|uses|builds|maintains|runs|owns|manages|leads|writes|designs)\b/i,
]

function normalizeReviewText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function hasReminderOrLookoutIntent(text: string): boolean {
  const normalized = normalizeReviewText(text)
  return normalized.length > 0 && REMINDER_OR_LOOKOUT_PATTERNS.some((pattern) => pattern.test(normalized))
}

export function hasDurableUserContext(text: string): boolean {
  const normalized = normalizeReviewText(text)
  return normalized.length > 0 && DURABLE_USER_CONTEXT_PATTERNS.some((pattern) => pattern.test(normalized))
}

export function isReminderOrLookoutOnlyContext(text: string): boolean {
  return hasReminderOrLookoutIntent(text) && !hasDurableUserContext(text)
}

export function isMemoryStorageEligibleFact(text: string): boolean {
  return !hasReminderOrLookoutIntent(text)
}

export function needsMemoryReview(text: string): boolean {
  return hasReminderOrLookoutIntent(text)
}

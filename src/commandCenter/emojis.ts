import emojiKeywords from 'emojilib'

export interface CommandCenterEmoji {
  emoji: string
  name: string
  keywords: string[]
}

const POPULAR_EMOJIS = [
  '😀',
  '😂',
  '🥹',
  '😍',
  '🥰',
  '😊',
  '😎',
  '🤔',
  '🫡',
  '😭',
  '😅',
  '🙌',
  '👏',
  '👍',
  '🙏',
  '💪',
  '🔥',
  '✨',
  '🎉',
  '❤️',
  '💯',
  '✅',
  '🚀',
  '👀',
  '💡',
  '⚡',
  '📌',
  '🔗',
  '⭐',
  '🏆',
  '🤣',
  '😘',
  '😜',
  '🤗',
  '😴',
  '🫠',
  '💀',
  '👻',
  '🤖',
  '😺',
  '🐶',
  '🐱',
  '🦊',
  '🐻',
  '🐼',
  '🦄',
  '🌸',
  '🌈',
  '☀️',
  '🌙',
  '🍕',
  '🍔',
  '☕',
  '🍺',
  '⚽',
  '🎮',
  '🎵',
  '📱',
  '💻',
  '⌚',
  '🎁',
  '🎂',
  '🏠',
  '✈️',
  '🚗',
  '💬',
  '📝',
  '🧡',
  '💛',
  '💚',
  '💙',
  '💜',
  '🖤',
  '🤍',
  '💔',
  '❣️',
  '💕',
] as const

const SKIN_TONES = [
  { emoji: '🏻', name: 'Light Skin Tone', keywords: ['light_skin_tone', 'skin_tone_2'] },
  {
    emoji: '🏼',
    name: 'Medium-Light Skin Tone',
    keywords: ['medium_light_skin_tone', 'skin_tone_3'],
  },
  { emoji: '🏽', name: 'Medium Skin Tone', keywords: ['medium_skin_tone', 'skin_tone_4'] },
  {
    emoji: '🏾',
    name: 'Medium-Dark Skin Tone',
    keywords: ['medium_dark_skin_tone', 'skin_tone_5'],
  },
  { emoji: '🏿', name: 'Dark Skin Tone', keywords: ['dark_skin_tone', 'skin_tone_6'] },
] as const

const emojiModifierBase = /\p{Emoji_Modifier_Base}/u

function displayName(keywords: string[]): string {
  const source = keywords[0] || 'emoji'
  return source.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function skinToneVariants(entry: CommandCenterEmoji): CommandCenterEmoji[] {
  const codePoints = Array.from(entry.emoji)
  const modifierIndex = codePoints.findIndex((codePoint) => emojiModifierBase.test(codePoint))
  if (modifierIndex < 0) return []
  return SKIN_TONES.map((tone) => {
    const value = [...codePoints]
    value.splice(modifierIndex + 1, 0, tone.emoji)
    return {
      emoji: value.join(''),
      name: `${entry.name}: ${tone.name}`,
      keywords: [...entry.keywords, ...tone.keywords, tone.name],
    }
  })
}

/** Lazy catalog state — built on first emoji open/search/paste, not at import. */
let baseEmojis: CommandCenterEmoji[] | null = null
let browseEmojis: CommandCenterEmoji[] | null = null
let fullEmojis: CommandCenterEmoji[] | null = null
let emojiSet: Set<string> | null = null
let popularEmojis: CommandCenterEmoji[] | null = null

function ensureBaseCatalog(): CommandCenterEmoji[] {
  if (baseEmojis) return baseEmojis
  baseEmojis = Object.entries(emojiKeywords).map(([emoji, keywords]) => ({
    emoji,
    name: displayName(keywords),
    keywords,
  }))
  return baseEmojis
}

function ensurePopular(): CommandCenterEmoji[] {
  if (popularEmojis) return popularEmojis
  const byEmoji = new Map(ensureBaseCatalog().map((entry) => [entry.emoji, entry]))
  const seen = new Set<string>()
  const out: CommandCenterEmoji[] = []
  for (const glyph of POPULAR_EMOJIS) {
    if (seen.has(glyph)) continue
    const entry = byEmoji.get(glyph)
    if (!entry) continue
    seen.add(glyph)
    out.push(entry)
  }
  popularEmojis = out
  return out
}

/** Popular-first full base list for empty-query browse (no skin-tone spam). */
function ensureBrowseCatalog(): CommandCenterEmoji[] {
  if (browseEmojis) return browseEmojis
  const popular = ensurePopular()
  const popularSet = new Set(popular.map((entry) => entry.emoji))
  // Keep emojilib order for the rest — avoid sorting 1.9k on first open.
  const rest = ensureBaseCatalog().filter((entry) => !popularSet.has(entry.emoji))
  browseEmojis = [...popular, ...rest]
  return browseEmojis
}

/** Base + skin-tone variants — only when search/allowlist needs them. */
function ensureFullCatalog(): CommandCenterEmoji[] {
  if (fullEmojis) return fullEmojis
  fullEmojis = ensureBaseCatalog().flatMap((entry) => [entry, ...skinToneVariants(entry)])
  return fullEmojis
}

function ensureEmojiSet(): Set<string> {
  if (emojiSet) return emojiSet
  const set = new Set<string>()
  for (const { emoji } of ensureFullCatalog()) {
    set.add(emoji)
    const stripped = emoji.replace(/\uFE0F/g, '')
    if (stripped) set.add(stripped)
  }
  emojiSet = set
  return set
}

export function getCommandCenterBaseEmojis(): CommandCenterEmoji[] {
  return ensureBaseCatalog()
}

export function getCommandCenterEmojiSet(): Set<string> {
  return ensureEmojiSet()
}

/** Alias used by tests/main — same as getCommandCenterEmojiSet(). */
export const COMMAND_CENTER_EMOJI_SET = {
  has(value: string): boolean {
    return ensureEmojiSet().has(value)
  },
  get size(): number {
    return ensureEmojiSet().size
  },
} as unknown as Set<string>

/** Alias used by tests — length reflects full base catalog. */
export const COMMAND_CENTER_BASE_EMOJIS = {
  get length(): number {
    return ensureBaseCatalog().length
  },
} as unknown as CommandCenterEmoji[]

function normalized(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s_-]+/g, ' ')
}

function scoreEmoji(entry: CommandCenterEmoji, rawQuery: string): number {
  const query = normalized(rawQuery)
  if (!query) return 1
  const name = normalized(entry.name)
  const keywords = entry.keywords.map(normalized)
  if (entry.emoji === rawQuery.trim()) return 1_000
  if (name === query) return 900
  if (name.startsWith(query)) return 700
  if (keywords.some((keyword) => keyword === query)) return 650
  if (keywords.some((keyword) => keyword.startsWith(query))) return 500
  if (name.includes(query)) return 350
  if (keywords.some((keyword) => keyword.includes(query))) return 250
  const tokens = query.split(' ')
  if (
    tokens.every(
      (token) => name.includes(token) || keywords.some((keyword) => keyword.includes(token))
    )
  ) {
    return 150
  }
  return 0
}

/**
 * Search / browse the emoji catalog (lazy-built).
 * - Empty query: every base emoji (popular first).
 * - Query: base + skin-tone variants, ranked.
 */
export function searchCommandCenterEmojis(
  query: string,
  limit = query.trim() ? 240 : Number.POSITIVE_INFINITY
): CommandCenterEmoji[] {
  if (!query.trim()) {
    const ordered = ensureBrowseCatalog()
    if (!Number.isFinite(limit)) return ordered
    return ordered.slice(0, Math.max(0, limit))
  }

  return ensureFullCatalog()
    .map((entry) => ({ entry, score: scoreEmoji(entry, query) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name))
    .slice(0, Math.max(0, limit))
    .map(({ entry }) => entry)
}

/** Resolve a paste candidate against the allowlist (handles FE0F variants). */
export function resolveCommandCenterEmoji(value: string): string | null {
  const set = ensureEmojiSet()
  if (set.has(value)) return value
  const stripped = value.replace(/\uFE0F/g, '')
  if (set.has(stripped)) return stripped
  const withVs = `${stripped}\uFE0F`
  if (set.has(withVs)) return withVs
  return null
}

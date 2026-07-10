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
] as const

function displayName(keywords: string[]): string {
  const source = keywords[0] || 'emoji'
  return source.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

const BASE_EMOJIS: CommandCenterEmoji[] = Object.entries(emojiKeywords).map(
  ([emoji, keywords]) => ({
    emoji,
    name: displayName(keywords),
    keywords,
  })
)

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

export const COMMAND_CENTER_EMOJIS: CommandCenterEmoji[] = BASE_EMOJIS.flatMap((entry) => [
  entry,
  ...skinToneVariants(entry),
])

export const COMMAND_CENTER_EMOJI_SET = new Set(COMMAND_CENTER_EMOJIS.map(({ emoji }) => emoji))

const emojiByValue = new Map(COMMAND_CENTER_EMOJIS.map((entry) => [entry.emoji, entry]))

export const POPULAR_COMMAND_CENTER_EMOJIS = POPULAR_EMOJIS.map((emoji) =>
  emojiByValue.get(emoji)
).filter((entry): entry is CommandCenterEmoji => Boolean(entry))

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

export function searchCommandCenterEmojis(query: string, limit = 80): CommandCenterEmoji[] {
  if (!query.trim()) return POPULAR_COMMAND_CENTER_EMOJIS.slice(0, limit)
  return COMMAND_CENTER_EMOJIS.map((entry) => ({ entry, score: scoreEmoji(entry, query) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name))
    .slice(0, limit)
    .map(({ entry }) => entry)
}

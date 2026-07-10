import { describe, expect, it } from 'vitest'

import {
  getCommandCenterBaseEmojis,
  getCommandCenterEmojiSet,
  resolveCommandCenterEmoji,
  searchCommandCenterEmojis,
} from './emojis'

describe('Command Center emoji search', () => {
  it('finds emoji by canonical name and related keywords', () => {
    expect(searchCommandCenterEmojis('rocket')[0]).toMatchObject({ emoji: '🚀', name: 'Rocket' })
    expect(searchCommandCenterEmojis('deploy').some(({ emoji }) => emoji === '🚀')).toBe(true)
  })

  it('includes searchable skin-tone variants in the validated catalog', () => {
    const result = searchCommandCenterEmojis('thumbs up medium skin tone').find(
      ({ emoji }) => emoji === '👍🏽'
    )
    expect(result?.name).toContain('Medium Skin Tone')
    expect(getCommandCenterEmojiSet().has('👍🏽')).toBe(true)
  })

  it('browses the full base emoji catalog when the query is empty', () => {
    const all = searchCommandCenterEmojis('')
    expect(all.length).toBe(getCommandCenterBaseEmojis().length)
    expect(all.length).toBeGreaterThan(1500)
  })

  it('resolves paste candidates with optional variation selectors', () => {
    expect(resolveCommandCenterEmoji('🚀')).toBe('🚀')
    expect(resolveCommandCenterEmoji('not-an-emoji')).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'

import { COMMAND_CENTER_EMOJI_SET, searchCommandCenterEmojis } from './emojis'

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
    expect(COMMAND_CENTER_EMOJI_SET.has('👍🏽')).toBe(true)
  })
})

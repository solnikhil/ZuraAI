import { describe, expect, it } from 'vitest'

import { scoreAppSearch, scoreWindowSearch } from './search'

describe('commandCenter search scoring', () => {
  it('ranks exact and prefix app matches above weak matches', () => {
    expect(scoreAppSearch('Kiro', ['Kiro'], 'kiro')).toBe(1000)
    expect(scoreAppSearch('Kiro IDE', ['Kiro IDE'], 'kiro')).toBe(850)
    expect(scoreAppSearch('Visual Studio Code', ['code'], 'vsc')).toBe(700)
  })

  it('does not match unrelated app names on partial substrings', () => {
    expect(scoreAppSearch('Antigravity', ['Antigravity'], 'kiro')).toBe(0)
  })

  it('does not match window titles where the query is only inside a larger token', () => {
    expect(scoreWindowSearch('#general | kirodotdev - Discord', 'Discord', 'kiro')).toBe(0)
  })

  it('matches windows on process or title word prefixes', () => {
    expect(scoreWindowSearch('Kiro - Settings', 'kiro', 'kiro')).toBeGreaterThan(0)
    expect(scoreWindowSearch('General', 'Kiro', 'kiro')).toBeGreaterThan(0)
  })
})
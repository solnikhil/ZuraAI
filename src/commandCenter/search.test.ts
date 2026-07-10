import { describe, expect, it } from 'vitest'

import {
  fuzzyNameScore,
  parseCommandCenterQuery,
  queryAllowsSource,
  scoreAppSearch,
  scoreGenericSearch,
  scoreWindowSearch,
} from './search'

describe('commandCenter search scoring', () => {
  it('ranks exact and prefix app matches above weak matches', () => {
    expect(scoreAppSearch('Kiro', ['Kiro'], 'kiro')).toBe(1000)
    expect(scoreAppSearch('Kiro IDE', ['Kiro IDE'], 'kiro')).toBe(850)
    expect(scoreAppSearch('Visual Studio Code', ['code'], 'vsc')).toBe(700)
  })

  it('does not match unrelated app names on partial substrings', () => {
    expect(scoreAppSearch('Antigravity', ['Antigravity'], 'kiro')).toBe(0)
  })

  it('matches close app-name typos like kird to Kiro', () => {
    expect(fuzzyNameScore('Kiro', 'kird')).toBeGreaterThan(0)
    expect(scoreAppSearch('Kiro', ['Kiro'], 'kird')).toBeGreaterThan(0)
    expect(scoreAppSearch('About Java', ['About Java'], 'kird')).toBe(0)
  })

  it('does not match window titles where the query is only inside a larger token', () => {
    expect(scoreWindowSearch('#general | kirodotdev - Discord', 'Discord', 'kiro')).toBe(0)
  })

  it('matches windows on process or title word prefixes', () => {
    expect(scoreWindowSearch('Kiro - Settings', 'kiro', 'kiro')).toBeGreaterThan(0)
    expect(scoreWindowSearch('General', 'Kiro', 'kiro')).toBeGreaterThan(0)
  })

  it('normalizes diacritics and requires every positive term', () => {
    expect(scoreGenericSearch(['Café quarterly report'], 'cafe report')).toBeGreaterThan(0)
    expect(scoreGenericSearch(['Café quarterly report'], 'cafe invoice')).toBe(0)
  })

  it('supports quoted phrases and excluded terms', () => {
    expect(scoreGenericSearch(['Q4 quarterly report final'], '"quarterly report" -draft')).toBeGreaterThan(0)
    expect(scoreGenericSearch(['Q4 quarterly report draft'], '"quarterly report" -draft')).toBe(0)
  })

  it('parses source scopes without treating safe filters as search terms', () => {
    const parsed = parseCommandCenterQuery('file:budget kind:document ext:pdf modified:this-week')
    expect(parsed.sources).toEqual(['file'])
    expect(parsed.terms).toEqual(['budget'])
    expect(parsed.filters).toEqual({ kind: 'document', ext: 'pdf', modified: 'this-week' })
    expect(queryAllowsSource(parsed, 'file')).toBe(true)
    expect(queryAllowsSource(parsed, 'app')).toBe(false)
  })

  it('adds typo tolerance to windows and generic sources', () => {
    expect(scoreWindowSearch('Quarterly Report', 'Explorer', 'quaterly')).toBeGreaterThan(0)
    expect(scoreGenericSearch(['Bluetooth settings'], 'bluetooh')).toBeGreaterThan(0)
  })
})

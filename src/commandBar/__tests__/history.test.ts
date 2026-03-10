/**
 * Property-Based Tests for Command History
 *
 * Feature: floating-command-palette
 * Validates: Requirements 12.1, 12.2, 12.3, 8.5
 *
 * Tests the command history persistence, max entries invariant,
 * and deduplication behavior using fast-check property-based testing.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import {
  loadCommandBarHistory,
  saveCommandBarHistory,
  recordCommandHistory,
  HISTORY_KEY,
  HISTORY_MAX,
  type CommandBarHistoryEntry,
} from '../history'
import type { CommandBarAction, CommandBarSuggestion } from '../suggestions'

// ============================================================================
// localStorage mock
// ============================================================================

let store: Record<string, string> = {}

const localStorageMock: Storage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value },
  removeItem: (key: string) => { delete store[key] },
  clear: () => { store = {} },
  get length() { return Object.keys(store).length },
  key: (index: number) => Object.keys(store)[index] ?? null,
}

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true })

// ============================================================================
// fast-check Arbitraries
// ============================================================================

const arbAction: fc.Arbitrary<CommandBarAction> = fc.oneof(
  fc.record({ type: fc.constant('new_chat' as const) }),
  fc.record({ type: fc.constant('toggle_sidebar_hidden' as const) }),
  fc.record({ type: fc.constant('toggle_sidebar_collapsed' as const) }),
  fc.record({
    type: fc.constant('open_dashboard_view' as const),
    view: fc.constantFrom('chat' as const, 'settings' as const),
  }),
  fc.record({
    type: fc.constant('export_chat' as const),
    format: fc.constantFrom('markdown' as const, 'text' as const),
  }),
)

const arbHistoryEntry: fc.Arbitrary<CommandBarHistoryEntry> = fc.record({
  suggestionId: fc.string({ minLength: 1, maxLength: 30 }),
  title: fc.string({ minLength: 1, maxLength: 50 }),
  subtitle: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  input: fc.string({ maxLength: 50 }),
  action: arbAction,
  lastUsedAt: fc.integer({ min: 0, max: Date.now() + 1_000_000 }),
})

const arbSuggestion: fc.Arbitrary<CommandBarSuggestion> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 30 }),
  title: fc.string({ minLength: 1, maxLength: 50 }),
  subtitle: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  keywords: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }), { nil: undefined }),
  action: arbAction,
  score: fc.double({ min: 0, max: 100, noNaN: true }),
})

// ============================================================================
// Property-based tests
// ============================================================================

describe('Property-based tests', () => {
  beforeEach(() => {
    store = {}
  })

  // --------------------------------------------------------------------------
  // Property 13: Command history persistence round-trip
  // --------------------------------------------------------------------------

  describe('Feature: floating-command-palette, Property 13: Command history persistence round-trip', () => {
    /**
     * Validates: Requirements 12.1
     *
     * For any valid CommandBarHistoryEntry array, saving via saveCommandBarHistory
     * and loading via loadCommandBarHistory should return equivalent entries.
     */
    it('save then load returns equivalent entries', () => {
      fc.assert(
        fc.property(
          fc.array(arbHistoryEntry, { minLength: 0, maxLength: HISTORY_MAX }),
          (entries) => {
            store = {}
            saveCommandBarHistory(entries)
            const loaded = loadCommandBarHistory()

            expect(loaded).toHaveLength(entries.length)
            for (let i = 0; i < entries.length; i++) {
              expect(loaded[i].suggestionId).toBe(entries[i].suggestionId)
              expect(loaded[i].title).toBe(entries[i].title)
              expect(loaded[i].action.type).toBe(entries[i].action.type)
              expect(loaded[i].lastUsedAt).toBe(entries[i].lastUsedAt)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('round-trip preserves the localStorage key', () => {
      fc.assert(
        fc.property(
          fc.array(arbHistoryEntry, { minLength: 1, maxLength: HISTORY_MAX }),
          (entries) => {
            store = {}
            saveCommandBarHistory(entries)
            expect(store[HISTORY_KEY]).toBeDefined()
            const parsed = JSON.parse(store[HISTORY_KEY])
            expect(Array.isArray(parsed)).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  // --------------------------------------------------------------------------
  // Property 14: History max entries invariant
  // --------------------------------------------------------------------------

  describe('Feature: floating-command-palette, Property 14: History max entries invariant', () => {
    /**
     * Validates: Requirements 12.2
     *
     * For any sequence of N command executions where N > HISTORY_MAX,
     * the persisted history should contain at most HISTORY_MAX entries.
     */
    it('history never exceeds HISTORY_MAX entries after saves', () => {
      fc.assert(
        fc.property(
          fc.array(arbHistoryEntry, { minLength: HISTORY_MAX + 1, maxLength: 30 }),
          (entries) => {
            store = {}
            saveCommandBarHistory(entries)
            const loaded = loadCommandBarHistory()
            expect(loaded.length).toBeLessThanOrEqual(HISTORY_MAX)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('recordCommandHistory never produces more than HISTORY_MAX entries', () => {
      fc.assert(
        fc.property(
          fc.array(arbSuggestion, { minLength: 1, maxLength: 20 }),
          fc.string({ maxLength: 30 }),
          (suggestions, input) => {
            store = {}
            let history: CommandBarHistoryEntry[] = []
            for (const suggestion of suggestions) {
              history = recordCommandHistory(history, suggestion, input)
            }
            expect(history.length).toBeLessThanOrEqual(HISTORY_MAX)

            // Also verify what's persisted
            const loaded = loadCommandBarHistory()
            expect(loaded.length).toBeLessThanOrEqual(HISTORY_MAX)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  // --------------------------------------------------------------------------
  // Property 15: History deduplication
  // --------------------------------------------------------------------------

  describe('Feature: floating-command-palette, Property 15: History deduplication', () => {
    /**
     * Validates: Requirements 12.3
     *
     * For any history state containing a command with id X, executing command X
     * again should not increase the history length, and the entry for X should
     * be at index 0 (most recent).
     */
    it('re-executing an existing command does not increase history length', () => {
      fc.assert(
        fc.property(
          fc.array(arbSuggestion, { minLength: 1, maxLength: HISTORY_MAX }),
          fc.nat({ max: 100 }),
          fc.string({ maxLength: 30 }),
          (suggestions, pickIndex, input) => {
            store = {}
            // Build initial history from unique suggestions
            const uniqueSuggestions = suggestions.filter(
              (s, i, arr) => arr.findIndex((x) => x.id === s.id) === i
            )
            if (uniqueSuggestions.length === 0) return

            let history: CommandBarHistoryEntry[] = []
            for (const s of uniqueSuggestions) {
              history = recordCommandHistory(history, s, input)
            }
            const lengthBefore = history.length

            // Re-execute one of the existing commands
            const target = uniqueSuggestions[pickIndex % uniqueSuggestions.length]
            history = recordCommandHistory(history, target, input)

            expect(history.length).toBe(lengthBefore)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('re-executed command moves to index 0', () => {
      fc.assert(
        fc.property(
          fc.array(arbSuggestion, { minLength: 2, maxLength: HISTORY_MAX }),
          fc.string({ maxLength: 30 }),
          (suggestions, input) => {
            store = {}
            // Build history from unique suggestions
            const uniqueSuggestions = suggestions.filter(
              (s, i, arr) => arr.findIndex((x) => x.id === s.id) === i
            )
            if (uniqueSuggestions.length < 2) return

            let history: CommandBarHistoryEntry[] = []
            for (const s of uniqueSuggestions) {
              history = recordCommandHistory(history, s, input)
            }

            // Pick the last item and re-execute it
            const lastItem = history[history.length - 1]
            const targetSuggestion: CommandBarSuggestion = {
              id: lastItem.suggestionId,
              title: lastItem.title,
              subtitle: lastItem.subtitle,
              action: lastItem.action,
              score: 0,
            }
            history = recordCommandHistory(history, targetSuggestion, input)

            // It should now be at index 0
            expect(history[0].suggestionId).toBe(lastItem.suggestionId)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('no duplicate suggestionIds exist after any sequence of recordings', () => {
      fc.assert(
        fc.property(
          fc.array(arbSuggestion, { minLength: 1, maxLength: 15 }),
          fc.string({ maxLength: 30 }),
          (suggestions, input) => {
            store = {}
            let history: CommandBarHistoryEntry[] = []
            for (const s of suggestions) {
              history = recordCommandHistory(history, s, input)
            }

            const ids = history.map((e) => e.suggestionId)
            const uniqueIds = new Set(ids)
            expect(ids.length).toBe(uniqueIds.size)
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})

// ============================================================================
// Unit tests
// ============================================================================

describe('Unit tests', () => {
  beforeEach(() => {
    store = {}
  })

  // --------------------------------------------------------------------------
  // loadCommandBarHistory
  // --------------------------------------------------------------------------

  describe('loadCommandBarHistory', () => {
    /**
     * Validates: Requirements 12.1
     */
    it('returns empty array when localStorage has no entry', () => {
      expect(loadCommandBarHistory()).toEqual([])
    })

    it('returns empty array when stored value is not valid JSON', () => {
      store[HISTORY_KEY] = '{not-json!!!'
      expect(loadCommandBarHistory()).toEqual([])
    })

    it('returns empty array when stored value is a non-array JSON value', () => {
      store[HISTORY_KEY] = JSON.stringify({ foo: 'bar' })
      expect(loadCommandBarHistory()).toEqual([])
    })

    it('returns empty array when stored value is a JSON string', () => {
      store[HISTORY_KEY] = JSON.stringify('hello')
      expect(loadCommandBarHistory()).toEqual([])
    })

    it('filters out entries missing required fields', () => {
      const valid: CommandBarHistoryEntry = {
        suggestionId: 'cmd-new-chat',
        title: 'New Chat',
        input: '',
        action: { type: 'new_chat' },
        lastUsedAt: 1000,
      }
      const missingId = { title: 'Bad', input: '', action: { type: 'new_chat' }, lastUsedAt: 1 }
      const missingTitle = { suggestionId: 'x', input: '', action: { type: 'new_chat' }, lastUsedAt: 1 }
      const missingAction = { suggestionId: 'y', title: 'Y', input: '', lastUsedAt: 1 }
      const nullEntry = null

      store[HISTORY_KEY] = JSON.stringify([valid, missingId, missingTitle, missingAction, nullEntry])
      const loaded = loadCommandBarHistory()

      expect(loaded).toHaveLength(1)
      expect(loaded[0].suggestionId).toBe('cmd-new-chat')
    })
  })

  // --------------------------------------------------------------------------
  // saveCommandBarHistory
  // --------------------------------------------------------------------------

  describe('saveCommandBarHistory', () => {
    /**
     * Validates: Requirements 12.1
     */
    it('persists entries under the correct localStorage key', () => {
      const entries: CommandBarHistoryEntry[] = [
        {
          suggestionId: 'cmd-new-chat',
          title: 'New Chat',
          input: 'new',
          action: { type: 'new_chat' },
          lastUsedAt: 1000,
        },
      ]
      saveCommandBarHistory(entries)
      expect(store[HISTORY_KEY]).toBeDefined()
      expect(JSON.parse(store[HISTORY_KEY])).toHaveLength(1)
    })

    it('silently catches quota exceeded errors', () => {
      // Temporarily make setItem throw to simulate quota exceeded
      const originalSetItem = localStorageMock.setItem
      localStorageMock.setItem = () => {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError')
      }

      expect(() => {
        saveCommandBarHistory([
          {
            suggestionId: 'cmd-new-chat',
            title: 'New Chat',
            input: '',
            action: { type: 'new_chat' },
            lastUsedAt: 1000,
          },
        ])
      }).not.toThrow()

      // Restore
      localStorageMock.setItem = originalSetItem
    })

    it('truncates entries beyond HISTORY_MAX before saving', () => {
      const entries: CommandBarHistoryEntry[] = Array.from({ length: 15 }, (_, i) => ({
        suggestionId: `cmd-${i}`,
        title: `Command ${i}`,
        input: '',
        action: { type: 'new_chat' as const },
        lastUsedAt: i,
      }))

      saveCommandBarHistory(entries)
      const parsed = JSON.parse(store[HISTORY_KEY])
      expect(parsed).toHaveLength(HISTORY_MAX)
    })
  })

  // --------------------------------------------------------------------------
  // recordCommandHistory
  // --------------------------------------------------------------------------

  describe('recordCommandHistory', () => {
    /**
     * Validates: Requirements 12.3
     */
    it('moves existing entry to top when re-executed', () => {
      const suggestionA: CommandBarSuggestion = {
        id: 'cmd-a',
        title: 'Command A',
        action: { type: 'new_chat' },
        score: 1,
      }
      const suggestionB: CommandBarSuggestion = {
        id: 'cmd-b',
        title: 'Command B',
        action: { type: 'toggle_sidebar_hidden' },
        score: 1,
      }
      const suggestionC: CommandBarSuggestion = {
        id: 'cmd-c',
        title: 'Command C',
        action: { type: 'toggle_sidebar_collapsed' },
        score: 1,
      }

      let history: CommandBarHistoryEntry[] = []
      history = recordCommandHistory(history, suggestionA, '')
      history = recordCommandHistory(history, suggestionB, '')
      history = recordCommandHistory(history, suggestionC, '')

      // Order should be C, B, A
      expect(history.map((e) => e.suggestionId)).toEqual(['cmd-c', 'cmd-b', 'cmd-a'])

      // Re-execute A — it should move to top
      history = recordCommandHistory(history, suggestionA, '')
      expect(history.map((e) => e.suggestionId)).toEqual(['cmd-a', 'cmd-c', 'cmd-b'])
      expect(history).toHaveLength(3) // no duplicates
    })

    it('adds new entry at the top', () => {
      const suggestion: CommandBarSuggestion = {
        id: 'cmd-new',
        title: 'New Command',
        action: { type: 'new_chat' },
        score: 1,
      }

      const result = recordCommandHistory([], suggestion, 'new')
      expect(result).toHaveLength(1)
      expect(result[0].suggestionId).toBe('cmd-new')
      expect(result[0].input).toBe('new')
    })

    it('trims whitespace from input', () => {
      const suggestion: CommandBarSuggestion = {
        id: 'cmd-x',
        title: 'X',
        action: { type: 'new_chat' },
        score: 1,
      }

      const result = recordCommandHistory([], suggestion, '  hello  ')
      expect(result[0].input).toBe('hello')
    })

    it('uses suggestion title as input when input is empty/whitespace', () => {
      const suggestion: CommandBarSuggestion = {
        id: 'cmd-x',
        title: 'My Title',
        action: { type: 'new_chat' },
        score: 1,
      }

      const result = recordCommandHistory([], suggestion, '   ')
      expect(result[0].input).toBe('My Title')
    })

    it('persists updated history to localStorage', () => {
      const suggestion: CommandBarSuggestion = {
        id: 'cmd-persist',
        title: 'Persist Test',
        action: { type: 'new_chat' },
        score: 1,
      }

      recordCommandHistory([], suggestion, 'test')
      const loaded = loadCommandBarHistory()
      expect(loaded).toHaveLength(1)
      expect(loaded[0].suggestionId).toBe('cmd-persist')
    })
  })
})

import { describe, it, expect } from 'vitest'
import {
  getDeepseekReasoning,
  setDeepseekReasoningEnabled,
  setDeepseekReasoningEffort,
  normalizeDeepseekReasoning,
  isDeepSeekReasoningEffort,
} from './deepseekReasoning'

describe('deepseekReasoning helpers', () => {
  describe('getDeepseekReasoning', () => {
    it('returns disabled + high by default when no entry', () => {
      expect(getDeepseekReasoning({}, 'deepseek-v4-pro')).toEqual({
        enabled: false,
        effort: 'high',
      })
    })

    it('uses deepseekLastEffort as the default effort', () => {
      expect(getDeepseekReasoning({ deepseekLastEffort: 'max' }, 'm')).toEqual({
        enabled: false,
        effort: 'max',
      })
    })

    it('returns the stored entry when present', () => {
      const settings = { deepseekReasoning: { m: { enabled: true, effort: 'max' as const } } }
      expect(getDeepseekReasoning(settings, 'm')).toEqual({ enabled: true, effort: 'max' })
    })

    it('falls back to default effort when stored effort is invalid', () => {
      const settings = {
        deepseekReasoning: { m: { enabled: true, effort: 'bogus' as never } },
        deepseekLastEffort: 'max' as const,
      }
      expect(getDeepseekReasoning(settings, 'm')).toEqual({ enabled: true, effort: 'max' })
    })
  })

  describe('setDeepseekReasoningEnabled', () => {
    it('toggles enablement while preserving existing effort', () => {
      const settings = { deepseekReasoning: { m: { enabled: false, effort: 'max' as const } } }
      const patch = setDeepseekReasoningEnabled(settings, 'm', true)
      expect(patch.deepseekReasoning?.m).toEqual({ enabled: true, effort: 'max' })
    })

    it('defaults effort from lastEffort when first enabling', () => {
      const patch = setDeepseekReasoningEnabled({ deepseekLastEffort: 'max' }, 'm', true)
      expect(patch.deepseekReasoning?.m).toEqual({ enabled: true, effort: 'max' })
    })

    it('does not clobber other models', () => {
      const settings = {
        deepseekReasoning: { other: { enabled: true, effort: 'high' as const } },
      }
      const patch = setDeepseekReasoningEnabled(settings, 'm', true)
      expect(patch.deepseekReasoning?.other).toEqual({ enabled: true, effort: 'high' })
    })
  })

  describe('setDeepseekReasoningEffort', () => {
    it('sets effort, enables, and records lastEffort', () => {
      const patch = setDeepseekReasoningEffort({}, 'm', 'max')
      expect(patch.deepseekReasoning.m).toEqual({ enabled: true, effort: 'max' })
      expect(patch.deepseekLastEffort).toBe('max')
    })
  })

  describe('normalizeDeepseekReasoning', () => {
    it('returns {} for non-objects', () => {
      expect(normalizeDeepseekReasoning(null)).toEqual({})
      expect(normalizeDeepseekReasoning(undefined)).toEqual({})
      expect(normalizeDeepseekReasoning([])).toEqual({})
      expect(normalizeDeepseekReasoning('x')).toEqual({})
    })

    it('keeps valid entries and drops malformed ones', () => {
      const input = {
        good: { enabled: true, effort: 'max' },
        badEffort: { enabled: true, effort: 'low' },
        badEnabled: { enabled: 'yes', effort: 'high' },
        notObject: 5,
      }
      expect(normalizeDeepseekReasoning(input)).toEqual({
        good: { enabled: true, effort: 'max' },
      })
    })
  })

  describe('isDeepSeekReasoningEffort', () => {
    it('accepts only high and max', () => {
      expect(isDeepSeekReasoningEffort('high')).toBe(true)
      expect(isDeepSeekReasoningEffort('max')).toBe(true)
      expect(isDeepSeekReasoningEffort('low')).toBe(false)
      expect(isDeepSeekReasoningEffort(undefined)).toBe(false)
    })
  })
})

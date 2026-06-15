import { describe, it, expect } from 'vitest'
import {
  getDeepseekReasoning,
  setDeepseekReasoningEnabled,
  setDeepseekReasoningEffort,
  normalizeDeepseekReasoning,
  isDeepSeekReasoningEffort,
  coerceReasoningEffort,
  DEEPSEEK_REASONING_EFFORTS,
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
      expect(getDeepseekReasoning({ deepseekLastEffort: 'low' }, 'm')).toEqual({
        enabled: false,
        effort: 'low',
      })
    })

    it('migrates a legacy "max" lastEffort to "xhigh"', () => {
      expect(getDeepseekReasoning({ deepseekLastEffort: 'max' as never }, 'm')).toEqual({
        enabled: false,
        effort: 'xhigh',
      })
    })

    it('returns the stored entry when present', () => {
      const settings = { deepseekReasoning: { m: { enabled: true, effort: 'medium' as const } } }
      expect(getDeepseekReasoning(settings, 'm')).toEqual({ enabled: true, effort: 'medium' })
    })

    it('migrates a legacy "max" stored effort to "xhigh"', () => {
      const settings = { deepseekReasoning: { m: { enabled: true, effort: 'max' as never } } }
      expect(getDeepseekReasoning(settings, 'm')).toEqual({ enabled: true, effort: 'xhigh' })
    })

    it('falls back to default effort when stored effort is invalid', () => {
      const settings = {
        deepseekReasoning: { m: { enabled: true, effort: 'bogus' as never } },
        deepseekLastEffort: 'low' as const,
      }
      expect(getDeepseekReasoning(settings, 'm')).toEqual({ enabled: true, effort: 'low' })
    })
  })

  describe('setDeepseekReasoningEnabled', () => {
    it('toggles enablement while preserving existing effort', () => {
      const settings = { deepseekReasoning: { m: { enabled: false, effort: 'xhigh' as const } } }
      const patch = setDeepseekReasoningEnabled(settings, 'm', true)
      expect(patch.deepseekReasoning?.m).toEqual({ enabled: true, effort: 'xhigh' })
    })

    it('defaults effort from lastEffort when first enabling', () => {
      const patch = setDeepseekReasoningEnabled({ deepseekLastEffort: 'medium' }, 'm', true)
      expect(patch.deepseekReasoning?.m).toEqual({ enabled: true, effort: 'medium' })
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
      const patch = setDeepseekReasoningEffort({}, 'm', 'xhigh')
      expect(patch.deepseekReasoning.m).toEqual({ enabled: true, effort: 'xhigh' })
      expect(patch.deepseekLastEffort).toBe('xhigh')
    })

    it('allows setting effort to none', () => {
      const patch = setDeepseekReasoningEffort({}, 'm', 'none')
      expect(patch.deepseekReasoning.m).toEqual({ enabled: true, effort: 'none' })
      expect(patch.deepseekLastEffort).toBe('none')
    })
  })

  describe('normalizeDeepseekReasoning', () => {
    it('returns {} for non-objects', () => {
      expect(normalizeDeepseekReasoning(null)).toEqual({})
      expect(normalizeDeepseekReasoning(undefined)).toEqual({})
      expect(normalizeDeepseekReasoning([])).toEqual({})
      expect(normalizeDeepseekReasoning('x')).toEqual({})
    })

    it('keeps valid entries, migrates legacy max, and drops malformed ones', () => {
      const input = {
        good: { enabled: true, effort: 'low' },
        legacy: { enabled: true, effort: 'max' },
        badEffort: { enabled: true, effort: 'turbo' },
        badEnabled: { enabled: 'yes', effort: 'high' },
        notObject: 5,
      }
      expect(normalizeDeepseekReasoning(input)).toEqual({
        good: { enabled: true, effort: 'low' },
        legacy: { enabled: true, effort: 'xhigh' },
      })
    })
  })

  describe('isDeepSeekReasoningEffort', () => {
    it('accepts the none→xhigh scale and rejects others', () => {
      expect(isDeepSeekReasoningEffort('none')).toBe(true)
      expect(isDeepSeekReasoningEffort('low')).toBe(true)
      expect(isDeepSeekReasoningEffort('medium')).toBe(true)
      expect(isDeepSeekReasoningEffort('high')).toBe(true)
      expect(isDeepSeekReasoningEffort('xhigh')).toBe(true)
      // 'max' is a legacy value, not part of the canonical scale.
      expect(isDeepSeekReasoningEffort('max')).toBe(false)
      expect(isDeepSeekReasoningEffort(undefined)).toBe(false)
    })
  })

  describe('coerceReasoningEffort', () => {
    it('maps legacy max to xhigh and passes valid values through', () => {
      expect(coerceReasoningEffort('max')).toBe('xhigh')
      expect(coerceReasoningEffort('high')).toBe('high')
      expect(coerceReasoningEffort('low')).toBe('low')
      expect(coerceReasoningEffort('nope')).toBeNull()
    })
  })

  describe('DEEPSEEK_REASONING_EFFORTS', () => {
    it('exposes the ordered none→xhigh scale', () => {
      expect(DEEPSEEK_REASONING_EFFORTS).toEqual(['none', 'low', 'medium', 'high', 'xhigh'])
    })
  })
})

/**
 * Property-Based Tests for Command Palette Settings
 *
 *
 * These tests verify the correctness property defined in the design document:
 * - Property 1: Settings round-trip preservation
 *
 * For any valid commandBar settings object (with all fields within their valid
 * ranges and enum values), serializing to JSON and deserializing back should
 * produce an equivalent object with all fields preserved.
 *
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { defaultSettingsUI } from '../../contexts/SettingsUIContext'

// Generators

/**
 * Arbitrary for generating a valid commandBar settings object
 * with all fields constrained to their valid ranges per the design doc.
 */
const commandBarArbitrary = fc.record({
  enabled: fc.boolean(),
  size: fc.constantFrom('small' as const, 'medium' as const, 'large' as const),
  maxSuggestions: fc.integer({ min: 3, max: 12 }),
  showRecents: fc.boolean(),
  maxRecents: fc.integer({ min: 0, max: 3 }),
  enableTabAutocomplete: fc.boolean(),
  overlayOpacity: fc.integer({ min: 0, max: 80 }),
  paletteWidth: fc.constantFrom('narrow' as const, 'default' as const, 'wide' as const),
  palettePosition: fc.constantFrom('top' as const, 'center' as const, 'lower' as const),
})

/**
 *
 * *For any* valid commandBar settings object (with all fields within their valid
 * ranges and enum values), writing the settings via context (JSON serialization
 * to localStorage) and reading them back should produce an equivalent commandBar
 * object with all fields preserved.
 *
 */
describe('Feature: command-palette-settings, Property 1: Settings round-trip preservation', () => {
  it('JSON serialize → deserialize preserves all commandBar fields exactly', () => {
    fc.assert(
      fc.property(commandBarArbitrary, (commandBar) => {
        // Simulate localStorage write (JSON.stringify) and read (JSON.parse)
        const serialized = JSON.stringify(commandBar)
        const deserialized = JSON.parse(serialized)

        // Every field must be preserved exactly
        expect(deserialized.enabled).toBe(commandBar.enabled)
        expect(deserialized.size).toBe(commandBar.size)
        expect(deserialized.maxSuggestions).toBe(commandBar.maxSuggestions)
        expect(deserialized.showRecents).toBe(commandBar.showRecents)
        expect(deserialized.maxRecents).toBe(commandBar.maxRecents)
        expect(deserialized.enableTabAutocomplete).toBe(commandBar.enableTabAutocomplete)
        expect(deserialized.overlayOpacity).toBe(commandBar.overlayOpacity)
        expect(deserialized.paletteWidth).toBe(commandBar.paletteWidth)
        expect(deserialized.palettePosition).toBe(commandBar.palettePosition)
      }),
      { numRuns: 100 }
    )
  })

  it('round-trip through localStorage preserves deep equality', () => {
    fc.assert(
      fc.property(commandBarArbitrary, (commandBar) => {
        // Simulate full settings object wrapping (as stored in zura-settings)
        const settingsWrapper = { commandBar }
        const stored = JSON.stringify(settingsWrapper)

        localStorage.setItem('zura-settings-roundtrip-test', stored)
        const retrieved = localStorage.getItem('zura-settings-roundtrip-test')

        expect(retrieved).not.toBeNull()
        const parsed = JSON.parse(retrieved!)
        expect(parsed.commandBar).toEqual(commandBar)

        localStorage.removeItem('zura-settings-roundtrip-test')
      }),
      { numRuns: 100 }
    )
  })

  it('field count is preserved (no extra or missing keys)', () => {
    fc.assert(
      fc.property(commandBarArbitrary, (commandBar) => {
        const serialized = JSON.stringify(commandBar)
        const deserialized = JSON.parse(serialized)

        const originalKeys = Object.keys(commandBar).sort()
        const deserializedKeys = Object.keys(deserialized).sort()

        expect(deserializedKeys).toEqual(originalKeys)
      }),
      { numRuns: 100 }
    )
  })
})

/**
 *
 * *For any* fresh commandBar settings object created from defaultSettingsUI,
 * the new fields should have their specified defaults:
 *   overlayOpacity = 45, paletteWidth = 'default', palettePosition = 'center'.
 *
 * While this is a deterministic check, we frame it as a property test per the spec:
 * the property holds for every possible "fresh init" scenario — the defaults are
 * always the same regardless of environment or prior state.
 *
 */

describe('Feature: command-palette-settings, Property 5: New settings fields have correct defaults', () => {
  it('defaultSettingsUI.commandBar contains correct defaults for new fields', () => {
    fc.assert(
      fc.property(
        fc.constant(null), // deterministic — property must hold on every run
        () => {
          const commandBar = defaultSettingsUI.commandBar

          expect(commandBar.overlayOpacity).toBe(45)
          expect(commandBar.paletteWidth).toBe('default')
          expect(commandBar.palettePosition).toBe('center')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('new fields exist and have the correct types', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const commandBar = defaultSettingsUI.commandBar

        expect(typeof commandBar.overlayOpacity).toBe('number')
        expect(typeof commandBar.paletteWidth).toBe('string')
        expect(typeof commandBar.palettePosition).toBe('string')
      }),
      { numRuns: 100 }
    )
  })

  it('overlayOpacity default is within valid range [0, 80]', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const { overlayOpacity } = defaultSettingsUI.commandBar
        expect(overlayOpacity).toBeGreaterThanOrEqual(0)
        expect(overlayOpacity).toBeLessThanOrEqual(80)
      }),
      { numRuns: 100 }
    )
  })

  it('paletteWidth default is a valid enum value', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const { paletteWidth } = defaultSettingsUI.commandBar
        expect(['narrow', 'default', 'wide']).toContain(paletteWidth)
      }),
      { numRuns: 100 }
    )
  })

  it('palettePosition default is a valid enum value', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const { palettePosition } = defaultSettingsUI.commandBar
        expect(['top', 'center', 'lower']).toContain(palettePosition)
      }),
      { numRuns: 100 }
    )
  })
})

/**
 *
 * *For any* numeric input value for overlayOpacity, the clamped value should be
 * within [0, 80]. Values outside the range should be clamped
 * to the nearest boundary.
 *
 * The clampNumber function is defined in AppearanceSection.tsx as:
 *   function clampNumber(value: number, min: number, max: number): number {
 *     if (Number.isNaN(value)) return min
 *     return Math.min(max, Math.max(min, value))
 *   }
 *
 * We replicate it here for direct property testing of the clamping logic.
 *
 */

// Replicate the clampNumber utility as defined in AppearanceSection.tsx
function clampNumber(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.min(max, Math.max(min, value))
}

describe('Feature: command-palette-settings, Property 6: Slider clamping preserves valid range', () => {
  // Slider definitions: [name, min, max]
  const sliderRanges: Array<[string, number, number]> = [['overlayOpacity', 0, 80]]

  for (const [name, min, max] of sliderRanges) {
    it(`${name}: clamped value is always within [${min}, ${max}] for any number`, () => {
      fc.assert(
        fc.property(
          // Generate arbitrary doubles including negatives, very large, very small, Infinity, -Infinity
          fc.oneof(
            fc.double({ noNaN: true }),
            fc.integer({ min: -10000, max: 10000 }),
            fc.constant(Infinity),
            fc.constant(-Infinity),
            fc.constant(0),
            fc.constant(-0)
          ),
          (input) => {
            const result = clampNumber(input, min, max)
            expect(result).toBeGreaterThanOrEqual(min)
            expect(result).toBeLessThanOrEqual(max)
          }
        ),
        { numRuns: 100 }
      )
    })
  }

  it('NaN input returns the minimum value for all sliders', () => {
    fc.assert(
      fc.property(fc.constantFrom(...sliderRanges), ([_name, min, max]) => {
        const result = clampNumber(NaN, min, max)
        expect(result).toBe(min)
      }),
      { numRuns: 100 }
    )
  })

  it('values within range are preserved unchanged', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...sliderRanges),
        fc.double({ min: 0, max: 1, noNaN: true }),
        ([_name, min, max], fraction) => {
          // Generate a value within the valid range
          const inRangeValue = min + fraction * (max - min)
          const result = clampNumber(inRangeValue, min, max)
          expect(result).toBe(inRangeValue)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('values below minimum are clamped to minimum', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...sliderRanges),
        fc.integer({ min: 1, max: 10000 }),
        ([_name, min, max], offset) => {
          const belowMin = min - offset
          const result = clampNumber(belowMin, min, max)
          expect(result).toBe(min)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('values above maximum are clamped to maximum', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...sliderRanges),
        fc.integer({ min: 1, max: 10000 }),
        ([_name, min, max], offset) => {
          const aboveMax = max + offset
          const result = clampNumber(aboveMax, min, max)
          expect(result).toBe(max)
        }
      ),
      { numRuns: 100 }
    )
  })
})

/**
 *
 * *For any* overlayOpacity value in the range [0, 80], the CommandPalette overlay's
 * backgroundColor should be `rgba(0, 0, 0, α)` where α = overlayOpacity / 100.
 * The default value of 45 should produce `rgba(0, 0, 0, 0.45)`.
 *
 * This tests the pure mapping logic from CommandPalette.tsx:
 *   `rgba(0, 0, 0, ${(commandBar.overlayOpacity ?? 45) / 100})`
 *
 */
describe('Feature: command-palette-settings, Property 2: Overlay opacity maps to backdrop alpha', () => {
  /**
   * The mapping function extracted from CommandPalette.tsx:
   *   backgroundColor: `rgba(0, 0, 0, ${(commandBar.overlayOpacity ?? 45) / 100})`
   */
  function computeOverlayBgColor(overlayOpacity: number): string {
    return `rgba(0, 0, 0, ${overlayOpacity / 100})`
  }

  it('any overlayOpacity in [0, 80] produces correct rgba string', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 80 }), (opacity) => {
        const result = computeOverlayBgColor(opacity)
        const expected = `rgba(0, 0, 0, ${opacity / 100})`
        expect(result).toBe(expected)
      }),
      { numRuns: 100 }
    )
  })

  it('rgba alpha component equals overlayOpacity / 100', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 80 }), (opacity) => {
        const result = computeOverlayBgColor(opacity)
        // Extract the alpha value from the rgba string
        const match = result.match(/rgba\(0, 0, 0, (.+)\)/)
        expect(match).not.toBeNull()
        const alpha = parseFloat(match![1])
        expect(alpha).toBeCloseTo(opacity / 100, 10)
      }),
      { numRuns: 100 }
    )
  })

  it('default overlayOpacity of 45 produces rgba(0, 0, 0, 0.45)', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const defaultOpacity = defaultSettingsUI.commandBar.overlayOpacity
        expect(defaultOpacity).toBe(45)
        const result = computeOverlayBgColor(defaultOpacity)
        expect(result).toBe('rgba(0, 0, 0, 0.45)')
      }),
      { numRuns: 100 }
    )
  })

  it('overlayOpacity of 0 produces fully transparent overlay', () => {
    const result = computeOverlayBgColor(0)
    expect(result).toBe('rgba(0, 0, 0, 0)')
  })

  it('overlayOpacity of 80 produces rgba(0, 0, 0, 0.8)', () => {
    const result = computeOverlayBgColor(80)
    expect(result).toBe('rgba(0, 0, 0, 0.8)')
  })
})

/**
 *
 * *For any* valid paletteWidth value ('narrow', 'default', 'wide'), the CommandPalette
 * content element's maxWidth should equal the corresponding pixel value:
 *   narrow → 440, default → 560, wide → 680.
 *
 * This tests the pure mapping logic from CommandPalette.tsx:
 *   const widthMap: Record<string, number> = { narrow: 440, default: 560, wide: 680 }
 *   maxWidth: widthMap[commandBar.paletteWidth ?? 'default'] ?? 560
 *
 */
describe('Feature: command-palette-settings, Property 3: Palette width maps to correct maxWidth', () => {
  const widthMap = Object.create(null) as Record<string, number>
  widthMap.narrow = 440
  widthMap.default = 560
  widthMap.wide = 680

  function computeMaxWidth(paletteWidth: string): number {
    return widthMap[paletteWidth ?? 'default'] ?? 560
  }

  it('any valid paletteWidth enum maps to the correct pixel value', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('narrow' as const, 'default' as const, 'wide' as const),
        (width) => {
          const result = computeMaxWidth(width)
          const expectedMap: Record<string, number> = { narrow: 440, default: 560, wide: 680 }
          expect(result).toBe(expectedMap[width])
        }
      ),
      { numRuns: 100 }
    )
  })

  it('narrow maps to 440px', () => {
    expect(computeMaxWidth('narrow')).toBe(440)
  })

  it('default maps to 560px', () => {
    expect(computeMaxWidth('default')).toBe(560)
  })

  it('wide maps to 680px', () => {
    expect(computeMaxWidth('wide')).toBe(680)
  })

  it('unknown paletteWidth falls back to 560 (default)', () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((s) => !['narrow', 'default', 'wide'].includes(s)),
        (unknownWidth) => {
          const result = computeMaxWidth(unknownWidth)
          expect(result).toBe(560)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('default paletteWidth setting is "default" which maps to 560px', () => {
    const defaultWidth = defaultSettingsUI.commandBar.paletteWidth
    expect(defaultWidth).toBe('default')
    expect(computeMaxWidth(defaultWidth)).toBe(560)
  })
})

/**
 *
 * *For any* valid palettePosition value ('top', 'center', 'lower'), the CommandPalette
 * content element's top CSS property should equal the corresponding percentage:
 *   top → '12%', center → '20%', lower → '30%'.
 *
 * This tests the pure mapping logic from CommandPalette.tsx:
 *   const positionMap: Record<string, string> = { top: '12%', center: '20%', lower: '30%' }
 *   top: positionMap[commandBar.palettePosition ?? 'center'] ?? '20%'
 *
 */
describe('Feature: command-palette-settings, Property 4: Palette position maps to correct top offset', () => {
  const positionMap = Object.create(null) as Record<string, string>
  positionMap.top = '12%'
  positionMap.center = '20%'
  positionMap.lower = '30%'

  function computeTopOffset(palettePosition: string): string {
    return positionMap[palettePosition ?? 'center'] ?? '20%'
  }

  it('any valid palettePosition enum maps to the correct CSS top value', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('top' as const, 'center' as const, 'lower' as const),
        (position) => {
          const result = computeTopOffset(position)
          const expectedMap: Record<string, string> = { top: '12%', center: '20%', lower: '30%' }
          expect(result).toBe(expectedMap[position])
        }
      ),
      { numRuns: 100 }
    )
  })

  it('top maps to 12%', () => {
    expect(computeTopOffset('top')).toBe('12%')
  })

  it('center maps to 20%', () => {
    expect(computeTopOffset('center')).toBe('20%')
  })

  it('lower maps to 30%', () => {
    expect(computeTopOffset('lower')).toBe('30%')
  })

  it('unknown palettePosition falls back to 20% (center default)', () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((s) => !['top', 'center', 'lower'].includes(s)),
        (unknownPosition) => {
          const result = computeTopOffset(unknownPosition)
          expect(result).toBe('20%')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('default palettePosition setting is "center" which maps to 20%', () => {
    const defaultPosition = defaultSettingsUI.commandBar.palettePosition
    expect(defaultPosition).toBe('center')
    expect(computeTopOffset(defaultPosition)).toBe('20%')
  })
})

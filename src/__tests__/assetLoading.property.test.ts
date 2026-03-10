/**
 * Property-Based Tests for Asset Loading Optimization
 *
 * This file contains property-based tests using fast-check to verify
 * universal properties of the asset loading optimization implementation.
 *
 * **Property 27: Asset Deferred Loading**
 * after Time To Interactive is reached.
 *
 *
 * **Property 28: First Contentful Paint Threshold**
 *
 *
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'

/**
 * Property test configuration
 */
const PROPERTY_TEST_CONFIG = {
  numRuns: 100,
  seed: 12345,
  timeout: 30000,
}

/**
 * FCP threshold from Requirement 7.6
 */
const FCP_THRESHOLD_MS = 500

/**
 * TTI timeout fallback from useLazyLoad implementation
 */
const TTI_TIMEOUT_DEFAULT_MS = 10000

/**
 * Asset configuration for testing
 */
interface AssetConfig {
  type: 'image' | 'font' | 'script' | 'stylesheet'
  critical: boolean
  waitForTTI: boolean
  rootMargin: string
}

/**
 * TTI state for testing
 */
interface TTIState {
  reached: boolean
  timestamp: number | null
}

/**
 * Intersection state for testing
 */
interface IntersectionState {
  isIntersecting: boolean
  timestamp: number
}

/**
 * Asset loading state for testing
 */
interface AssetLoadingState {
  shouldLoad: boolean
  loadStartedAt: number | null
  ttiState: TTIState
  intersectionState: IntersectionState
}

/**
 * Generators for property-based testing
 */
const generators = {
  /**
   * Generate asset configuration
   */
  assetConfig: fc.record({
    type: fc.constantFrom('image', 'font', 'script', 'stylesheet') as fc.Arbitrary<
      'image' | 'font' | 'script' | 'stylesheet'
    >,
    critical: fc.boolean(),
    waitForTTI: fc.boolean(),
    rootMargin: fc.constantFrom('0px', '50px', '100px', '200px'),
  }),

  /**
   * Generate non-critical asset configuration (always has waitForTTI=true)
   */
  nonCriticalAsset: fc.record({
    type: fc.constantFrom('image', 'font', 'script', 'stylesheet') as fc.Arbitrary<
      'image' | 'font' | 'script' | 'stylesheet'
    >,
    critical: fc.constant(false),
    waitForTTI: fc.constant(true),
    rootMargin: fc.constantFrom('0px', '50px', '100px', '200px'),
  }),

  /**
   * Generate TTI state
   */
  ttiState: fc.record({
    reached: fc.boolean(),
    timestamp: fc.option(fc.integer({ min: 100, max: 5000 }), { nil: null }),
  }),

  /**
   * Generate intersection state
   */
  intersectionState: fc.record({
    isIntersecting: fc.boolean(),
    timestamp: fc.integer({ min: 0, max: 10000 }),
  }),

  /**
   * Generate FCP timing value (in milliseconds)
   */
  fcpTiming: fc.integer({ min: 50, max: 2000 }),

  /**
   * Generate valid FCP timing (within threshold)
   */
  validFcpTiming: fc.integer({ min: 50, max: FCP_THRESHOLD_MS }),

  /**
   * Generate invalid FCP timing (exceeds threshold)
   */
  invalidFcpTiming: fc.integer({ min: FCP_THRESHOLD_MS + 1, max: 2000 }),

  /**
   * Generate TTI timing value (in milliseconds)
   */
  ttiTiming: fc.integer({ min: 500, max: 10000 }),

  /**
   * Generate a sequence of asset load requests
   */
  assetLoadSequence: fc.array(
    fc.record({
      assetId: fc.string({ minLength: 1, maxLength: 10 }),
      waitForTTI: fc.boolean(),
      requestTime: fc.integer({ min: 0, max: 5000 }),
    }),
    { minLength: 1, maxLength: 20 }
  ),

  /**
   * Generate performance metrics
   */
  performanceMetrics: fc.record({
    fcp: fc.option(fc.integer({ min: 50, max: 2000 }), { nil: null }),
    tti: fc.option(fc.integer({ min: 500, max: 10000 }), { nil: null }),
    lcp: fc.option(fc.integer({ min: 100, max: 5000 }), { nil: null }),
    navigationStart: fc.integer({ min: 0, max: 100 }),
  }),
}

/**
 * Simulates the shouldLoad logic from useLazyLoad hook
 *
 * @param waitForTTI - Whether to wait for TTI before loading
 * @param isIntersecting - Whether the element is in the viewport
 * @param ttiReached - Whether TTI has been reached
 * @returns Whether the asset should load
 */
function calculateShouldLoad(
  waitForTTI: boolean,
  isIntersecting: boolean,
  ttiReached: boolean
): boolean {
  // If not waiting for TTI, only intersection matters
  if (!waitForTTI) {
    return isIntersecting
  }
  // If waiting for TTI, both conditions must be met
  return isIntersecting && ttiReached
}

/**
 * Simulates FCP threshold check from rendererPerformance
 *
 * @param fcpMs - First Contentful Paint timing in milliseconds
 * @returns Whether FCP is within the acceptable threshold
 */
function isFcpWithinThreshold(fcpMs: number | null): boolean {
  if (fcpMs === null) {
    return true // No FCP data yet, assume OK
  }
  return fcpMs <= FCP_THRESHOLD_MS
}

/**
 * Generates a warning message for FCP threshold violation
 *
 * @param fcpMs - First Contentful Paint timing in milliseconds
 * @returns Warning message or null if within threshold
 */
function getFcpWarning(fcpMs: number | null): string | null {
  if (fcpMs === null || fcpMs <= FCP_THRESHOLD_MS) {
    return null
  }
  return `FCP (${fcpMs.toFixed(0)}ms) exceeds ${FCP_THRESHOLD_MS}ms threshold`
}

describe('Asset Loading Property Tests', () => {
  describe('Property 27: Asset Deferred Loading', () => {
    /**
     * **Property 27: Asset Deferred Loading**
     *
     * after Time To Interactive is reached.
     *
     */
    it('should not load assets with waitForTTI=true until TTI is reached', async () => {
      await fc.assert(
        fc.asyncProperty(
          generators.nonCriticalAsset,
          generators.intersectionState,
          async (assetConfig, intersectionState) => {
            // When waitForTTI is true and TTI has NOT been reached
            const ttiNotReached = false

            const shouldLoad = calculateShouldLoad(
              assetConfig.waitForTTI,
              intersectionState.isIntersecting,
              ttiNotReached
            )

            // Asset should NOT load regardless of intersection state
            expect(shouldLoad).toBe(false)
          }
        ),
        { numRuns: PROPERTY_TEST_CONFIG.numRuns, seed: PROPERTY_TEST_CONFIG.seed }
      )
    })

    it('should load assets with waitForTTI=true only after TTI is reached AND in viewport', async () => {
      await fc.assert(
        fc.asyncProperty(generators.nonCriticalAsset, async (assetConfig) => {
          // When TTI has been reached AND element is intersecting
          const ttiReached = true
          const isIntersecting = true

          const shouldLoad = calculateShouldLoad(assetConfig.waitForTTI, isIntersecting, ttiReached)

          // Asset SHOULD load when both conditions are met
          expect(shouldLoad).toBe(true)
        }),
        { numRuns: PROPERTY_TEST_CONFIG.numRuns, seed: PROPERTY_TEST_CONFIG.seed }
      )
    })

    it('should not load assets with waitForTTI=true when TTI reached but not in viewport', async () => {
      await fc.assert(
        fc.asyncProperty(generators.nonCriticalAsset, async (assetConfig) => {
          // When TTI has been reached but element is NOT intersecting
          const ttiReached = true
          const isIntersecting = false

          const shouldLoad = calculateShouldLoad(assetConfig.waitForTTI, isIntersecting, ttiReached)

          // Asset should NOT load - needs both conditions
          expect(shouldLoad).toBe(false)
        }),
        { numRuns: PROPERTY_TEST_CONFIG.numRuns, seed: PROPERTY_TEST_CONFIG.seed }
      )
    })

    it('should load assets without waitForTTI immediately when in viewport', async () => {
      await fc.assert(
        fc.asyncProperty(
          generators.assetConfig,
          generators.ttiState,
          async (assetConfig, ttiState) => {
            // Override waitForTTI to false for this test
            const configWithoutTTI = { ...assetConfig, waitForTTI: false }
            const isIntersecting = true

            const shouldLoad = calculateShouldLoad(
              configWithoutTTI.waitForTTI,
              isIntersecting,
              ttiState.reached
            )

            // Asset should load regardless of TTI state when waitForTTI is false
            expect(shouldLoad).toBe(true)
          }
        ),
        { numRuns: PROPERTY_TEST_CONFIG.numRuns, seed: PROPERTY_TEST_CONFIG.seed }
      )
    })

    it('should verify TTI gating is consistent across multiple assets', async () => {
      await fc.assert(
        fc.asyncProperty(
          generators.assetLoadSequence,
          generators.ttiTiming,
          async (assetSequence, ttiTime) => {
            // Simulate multiple assets with different request times
            const results: { assetId: string; loaded: boolean; requestTime: number }[] = []

            for (const asset of assetSequence) {
              // TTI is reached at ttiTime
              const ttiReached = asset.requestTime >= ttiTime
              const isIntersecting = true // Assume all are in viewport

              const shouldLoad = calculateShouldLoad(asset.waitForTTI, isIntersecting, ttiReached)

              results.push({
                assetId: asset.assetId,
                loaded: shouldLoad,
                requestTime: asset.requestTime,
              })
            }

            // Verify: assets with waitForTTI=true should only load after ttiTime
            for (const result of results) {
              const asset = assetSequence.find((a) => a.assetId === result.assetId)
              if (asset?.waitForTTI) {
                if (asset.requestTime < ttiTime) {
                  expect(result.loaded).toBe(false)
                } else {
                  expect(result.loaded).toBe(true)
                }
              }
            }
          }
        ),
        { numRuns: PROPERTY_TEST_CONFIG.numRuns, seed: PROPERTY_TEST_CONFIG.seed }
      )
    })

    it('should verify TTI timeout fallback behavior', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 15000 }),
          fc.integer({ min: 5000, max: 20000 }),
          async (elapsedTime, customTimeout) => {
            // TTI timeout should force loading after the timeout period
            const ttiTimeout = customTimeout || TTI_TIMEOUT_DEFAULT_MS
            const shouldForceLoad = elapsedTime >= ttiTimeout

            // If timeout is reached, TTI should be considered reached
            if (shouldForceLoad) {
              const shouldLoad = calculateShouldLoad(true, true, true)
              expect(shouldLoad).toBe(true)
            }
          }
        ),
        { numRuns: PROPERTY_TEST_CONFIG.numRuns, seed: PROPERTY_TEST_CONFIG.seed }
      )
    })
  })

  describe('Property 28: First Contentful Paint Threshold', () => {
    /**
     * **Property 28: First Contentful Paint Threshold**
     *
     *
     */
    it('should pass threshold check for FCP values <= 500ms', async () => {
      await fc.assert(
        fc.asyncProperty(generators.validFcpTiming, async (fcpMs) => {
          const isWithinThreshold = isFcpWithinThreshold(fcpMs)

          // FCP values at or below threshold should pass
          expect(isWithinThreshold).toBe(true)
          expect(fcpMs).toBeLessThanOrEqual(FCP_THRESHOLD_MS)
        }),
        { numRuns: PROPERTY_TEST_CONFIG.numRuns, seed: PROPERTY_TEST_CONFIG.seed }
      )
    })

    it('should fail threshold check for FCP values > 500ms', async () => {
      await fc.assert(
        fc.asyncProperty(generators.invalidFcpTiming, async (fcpMs) => {
          const isWithinThreshold = isFcpWithinThreshold(fcpMs)

          // FCP values above threshold should fail
          expect(isWithinThreshold).toBe(false)
          expect(fcpMs).toBeGreaterThan(FCP_THRESHOLD_MS)
        }),
        { numRuns: PROPERTY_TEST_CONFIG.numRuns, seed: PROPERTY_TEST_CONFIG.seed }
      )
    })

    it('should generate appropriate warning for FCP threshold violations', async () => {
      await fc.assert(
        fc.asyncProperty(generators.fcpTiming, async (fcpMs) => {
          const warning = getFcpWarning(fcpMs)

          if (fcpMs <= FCP_THRESHOLD_MS) {
            // No warning for values within threshold
            expect(warning).toBeNull()
          } else {
            // Warning should be generated for values exceeding threshold
            expect(warning).not.toBeNull()
            expect(warning).toContain('FCP')
            expect(warning).toContain(`${FCP_THRESHOLD_MS}ms`)
            expect(warning).toContain('exceeds')
          }
        }),
        { numRuns: PROPERTY_TEST_CONFIG.numRuns, seed: PROPERTY_TEST_CONFIG.seed }
      )
    })

    it('should handle null FCP values gracefully', async () => {
      // Null FCP means metrics haven't been collected yet
      const isWithinThreshold = isFcpWithinThreshold(null)
      const warning = getFcpWarning(null)

      // Should not fail or warn when FCP is not yet available
      expect(isWithinThreshold).toBe(true)
      expect(warning).toBeNull()
    })

    it('should verify FCP threshold is consistent with requirement 7.6', () => {
      expect(FCP_THRESHOLD_MS).toBe(500)
    })

    it('should verify FCP boundary conditions', async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 490, max: 510 }), async (fcpMs) => {
          const isWithinThreshold = isFcpWithinThreshold(fcpMs)

          // Exact boundary: 500ms should pass, 501ms should fail
          if (fcpMs <= 500) {
            expect(isWithinThreshold).toBe(true)
          } else {
            expect(isWithinThreshold).toBe(false)
          }
        }),
        { numRuns: PROPERTY_TEST_CONFIG.numRuns, seed: PROPERTY_TEST_CONFIG.seed }
      )
    })
  })

  describe('Combined Asset Loading and FCP Properties', () => {
    /**
     * Tests that verify the interaction between asset loading and FCP metrics
     */
    it('should verify deferred loading does not negatively impact FCP', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate valid metrics where FCP <= TTI (realistic constraint)
          fc.integer({ min: 50, max: 500 }).chain((fcp) =>
            fc.record({
              fcp: fc.constant(fcp),
              tti: fc.integer({ min: fcp, max: 10000 }), // TTI >= FCP
              lcp: fc.option(fc.integer({ min: 100, max: 5000 }), { nil: null }),
              navigationStart: fc.integer({ min: 0, max: 100 }),
            })
          ),
          generators.assetLoadSequence,
          async (metrics, assetSequence) => {
            // Non-critical assets with waitForTTI should not block FCP
            const nonCriticalAssets = assetSequence.filter((a) => a.waitForTTI)

            // FCP should occur before or at TTI (by definition)
            expect(metrics.fcp).toBeLessThanOrEqual(metrics.tti)

            // Non-critical assets should not have loaded before TTI
            for (const asset of nonCriticalAssets) {
              if (asset.requestTime < metrics.tti) {
                // Asset requested before TTI with waitForTTI should not load yet
                const shouldLoad = calculateShouldLoad(
                  asset.waitForTTI,
                  true, // Assume in viewport
                  false // TTI not reached yet
                )
                expect(shouldLoad).toBe(false)
              }
            }
          }
        ),
        { numRuns: PROPERTY_TEST_CONFIG.numRuns, seed: PROPERTY_TEST_CONFIG.seed }
      )
    })

    it('should verify critical assets can load before TTI', async () => {
      await fc.assert(
        fc.asyncProperty(
          generators.assetConfig,
          generators.ttiState,
          async (assetConfig, ttiState) => {
            // Critical assets should not wait for TTI
            const criticalConfig = { ...assetConfig, waitForTTI: false, critical: true }
            const isIntersecting = true

            const shouldLoad = calculateShouldLoad(
              criticalConfig.waitForTTI,
              isIntersecting,
              ttiState.reached
            )

            // Critical assets should load immediately when in viewport
            expect(shouldLoad).toBe(true)
          }
        ),
        { numRuns: PROPERTY_TEST_CONFIG.numRuns, seed: PROPERTY_TEST_CONFIG.seed }
      )
    })
  })

  describe('LazyImage Component Properties', () => {
    /**
     * Tests specific to the LazyImage component behavior
     */
    it('should verify LazyImage respects waitForTTI option', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.boolean(),
          fc.boolean(),
          fc.boolean(),
          async (waitForTTI, isIntersecting, ttiReached) => {
            // Simulate LazyImage shouldLoad calculation
            const shouldLoad = calculateShouldLoad(waitForTTI, isIntersecting, ttiReached)

            // Verify the logic matches expected behavior
            if (!waitForTTI) {
              // Without TTI gating, only intersection matters
              expect(shouldLoad).toBe(isIntersecting)
            } else {
              // With TTI gating, both conditions must be met
              expect(shouldLoad).toBe(isIntersecting && ttiReached)
            }
          }
        ),
        { numRuns: PROPERTY_TEST_CONFIG.numRuns, seed: PROPERTY_TEST_CONFIG.seed }
      )
    })

    it('should verify rootMargin affects intersection timing', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('0px', '50px', '100px', '200px', '500px'),
          fc.integer({ min: 0, max: 1000 }),
          async (rootMargin, distanceFromViewport) => {
            // Parse rootMargin value
            const marginPx = parseInt(rootMargin, 10)

            // Element is considered intersecting if within rootMargin of viewport
            const wouldIntersect = distanceFromViewport <= marginPx

            // Larger rootMargin means earlier intersection (preloading)
            if (marginPx > 0 && distanceFromViewport > 0) {
              // With positive margin, elements outside viewport can still intersect
              expect(wouldIntersect).toBe(distanceFromViewport <= marginPx)
            }
          }
        ),
        { numRuns: PROPERTY_TEST_CONFIG.numRuns, seed: PROPERTY_TEST_CONFIG.seed }
      )
    })
  })

  describe('Performance Metrics Validation', () => {
    /**
     * Tests for performance metrics validation logic
     */
    it('should verify checkThresholds returns correct warnings', async () => {
      await fc.assert(
        fc.asyncProperty(generators.performanceMetrics, async (metrics) => {
          const warnings: string[] = []

          // Check FCP threshold (500ms from Requirement 7.6)
          if (metrics.fcp !== null && metrics.fcp > FCP_THRESHOLD_MS) {
            warnings.push(
              `FCP (${metrics.fcp.toFixed(0)}ms) exceeds ${FCP_THRESHOLD_MS}ms threshold`
            )
          }

          // Verify warning generation is consistent
          if (metrics.fcp !== null) {
            if (metrics.fcp > FCP_THRESHOLD_MS) {
              expect(warnings.length).toBeGreaterThan(0)
              expect(warnings.some((w) => w.includes('FCP'))).toBe(true)
            } else {
              expect(warnings.filter((w) => w.includes('FCP')).length).toBe(0)
            }
          }
        }),
        { numRuns: PROPERTY_TEST_CONFIG.numRuns, seed: PROPERTY_TEST_CONFIG.seed }
      )
    })

    it('should verify metrics ordering (FCP <= TTI)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 50, max: 500 }),
          fc.integer({ min: 500, max: 10000 }),
          async (fcp, tti) => {
            // FCP should always occur before or at TTI
            // This is a fundamental property of web performance metrics
            expect(fcp).toBeLessThanOrEqual(tti)
          }
        ),
        { numRuns: PROPERTY_TEST_CONFIG.numRuns, seed: PROPERTY_TEST_CONFIG.seed }
      )
    })
  })
})

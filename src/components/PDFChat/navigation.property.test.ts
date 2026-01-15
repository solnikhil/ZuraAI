/**
 * Property-Based Tests for PDF Navigation
 * 
 * **Property 25: Zoom Level Bounds**
 * For any zoom operation, zoom levels within the range [25%, 400%] SHALL be 
 * accepted and applied, while values outside this range SHALL be clamped 
 * to the nearest bound.
 * 
 * **Property 26: Page Navigation Bounds**
 * For any page navigation request (by number, thumbnail click, or keyboard), 
 * the target page SHALL be clamped to valid range [1, pageCount], and the 
 * viewer SHALL navigate to the clamped value.
 * 
 * **Validates: Requirements 3.7, 3.8**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  clampZoom,
  clampPage,
  zoomIn,
  zoomOut,
  nextPage,
  previousPage,
  isMinZoom,
  isMaxZoom,
  isFirstPage,
  isLastPage,
  MIN_ZOOM,
  MAX_ZOOM,
  DEFAULT_ZOOM,
  ZOOM_STEP,
} from './navigationUtils';

describe('PDF Navigation Property Tests', () => {
  /**
   * Property 25: Zoom Level Bounds
   * 
   * For any zoom operation, zoom levels within the range [25%, 400%] SHALL be 
   * accepted and applied, while values outside this range SHALL be clamped 
   * to the nearest bound.
   * 
   * **Validates: Requirements 3.8**
   */
  describe('Property 25: Zoom Level Bounds', () => {
    it('should clamp zoom levels below MIN_ZOOM to MIN_ZOOM', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -10000, max: MIN_ZOOM - 1 }),
          (zoom) => {
            const result = clampZoom(zoom);
            expect(result).toBe(MIN_ZOOM);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should clamp zoom levels above MAX_ZOOM to MAX_ZOOM', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: MAX_ZOOM + 1, max: 10000 }),
          (zoom) => {
            const result = clampZoom(zoom);
            expect(result).toBe(MAX_ZOOM);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve zoom levels within valid range [MIN_ZOOM, MAX_ZOOM]', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: MIN_ZOOM, max: MAX_ZOOM }),
          (zoom) => {
            const result = clampZoom(zoom);
            expect(result).toBe(zoom);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should always return a value within [MIN_ZOOM, MAX_ZOOM]', () => {
      fc.assert(
        fc.property(
          fc.double({ min: -100000, max: 100000, noNaN: true }),
          (zoom) => {
            const result = clampZoom(zoom);
            expect(result).toBeGreaterThanOrEqual(MIN_ZOOM);
            expect(result).toBeLessThanOrEqual(MAX_ZOOM);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle NaN by returning DEFAULT_ZOOM', () => {
      const result = clampZoom(NaN);
      expect(result).toBe(DEFAULT_ZOOM);
    });

    it('zoomIn should never exceed MAX_ZOOM', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: MIN_ZOOM, max: MAX_ZOOM }),
          (currentZoom) => {
            const result = zoomIn(currentZoom);
            expect(result).toBeLessThanOrEqual(MAX_ZOOM);
            expect(result).toBeGreaterThanOrEqual(MIN_ZOOM);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('zoomOut should never go below MIN_ZOOM', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: MIN_ZOOM, max: MAX_ZOOM }),
          (currentZoom) => {
            const result = zoomOut(currentZoom);
            expect(result).toBeGreaterThanOrEqual(MIN_ZOOM);
            expect(result).toBeLessThanOrEqual(MAX_ZOOM);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('isMinZoom should return true only at MIN_ZOOM', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: MIN_ZOOM, max: MAX_ZOOM }),
          (zoom) => {
            const result = isMinZoom(zoom);
            if (zoom <= MIN_ZOOM) {
              expect(result).toBe(true);
            } else {
              expect(result).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('isMaxZoom should return true only at MAX_ZOOM', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: MIN_ZOOM, max: MAX_ZOOM }),
          (zoom) => {
            const result = isMaxZoom(zoom);
            if (zoom >= MAX_ZOOM) {
              expect(result).toBe(true);
            } else {
              expect(result).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 26: Page Navigation Bounds
   * 
   * For any page navigation request (by number, thumbnail click, or keyboard), 
   * the target page SHALL be clamped to valid range [1, pageCount], and the 
   * viewer SHALL navigate to the clamped value.
   * 
   * **Validates: Requirements 3.7**
   */
  describe('Property 26: Page Navigation Bounds', () => {
    it('should clamp page numbers below 1 to 1', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -10000, max: 0 }),
          fc.integer({ min: 1, max: 10000 }),
          (page, totalPages) => {
            const result = clampPage(page, totalPages);
            expect(result).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should clamp page numbers above totalPages to totalPages', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10000 }),
          (totalPages) => {
            const page = totalPages + fc.sample(fc.integer({ min: 1, max: 1000 }), 1)[0];
            const result = clampPage(page, totalPages);
            expect(result).toBe(totalPages);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve page numbers within valid range [1, totalPages]', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10000 }),
          (totalPages) => {
            const page = fc.sample(fc.integer({ min: 1, max: totalPages }), 1)[0];
            const result = clampPage(page, totalPages);
            expect(result).toBe(page);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should always return a value within [1, totalPages]', () => {
      fc.assert(
        fc.property(
          fc.double({ min: -100000, max: 100000, noNaN: true }),
          fc.integer({ min: 1, max: 10000 }),
          (page, totalPages) => {
            const result = clampPage(page, totalPages);
            expect(result).toBeGreaterThanOrEqual(1);
            expect(result).toBeLessThanOrEqual(totalPages);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return 1 for invalid totalPages', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          fc.integer({ min: -1000, max: 0 }),
          (page, totalPages) => {
            const result = clampPage(page, totalPages);
            expect(result).toBe(1);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle NaN page by returning 1', () => {
      const result = clampPage(NaN, 100);
      expect(result).toBe(1);
    });

    it('should round floating point page numbers', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 1, max: 100, noNaN: true }),
          fc.integer({ min: 100, max: 1000 }),
          (page, totalPages) => {
            const result = clampPage(page, totalPages);
            expect(Number.isInteger(result)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('nextPage should never exceed totalPages', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10000 }),
          (totalPages) => {
            const currentPage = fc.sample(fc.integer({ min: 1, max: totalPages }), 1)[0];
            const result = nextPage(currentPage, totalPages);
            expect(result).toBeLessThanOrEqual(totalPages);
            expect(result).toBeGreaterThanOrEqual(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('previousPage should never go below 1', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10000 }),
          (totalPages) => {
            const currentPage = fc.sample(fc.integer({ min: 1, max: totalPages }), 1)[0];
            const result = previousPage(currentPage, totalPages);
            expect(result).toBeGreaterThanOrEqual(1);
            expect(result).toBeLessThanOrEqual(totalPages);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('isFirstPage should return true only at page 1', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }),
          (page) => {
            const result = isFirstPage(page);
            if (page <= 1) {
              expect(result).toBe(true);
            } else {
              expect(result).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('isLastPage should return true only at totalPages', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }),
          fc.integer({ min: 1, max: 1000 }),
          (page, totalPages) => {
            const result = isLastPage(page, totalPages);
            if (page >= totalPages) {
              expect(result).toBe(true);
            } else {
              expect(result).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

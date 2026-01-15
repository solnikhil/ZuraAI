/**
 * Property-Based Tests for PDF Thumbnails
 * 
 * **Property 27: Thumbnail Count Consistency**
 * For any loaded PDF document, the number of generated thumbnails SHALL equal the document's page count.
 * 
 * **Validates: Requirements 3.2, 3.6**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { generateThumbnailPages } from './thumbnailUtils';

describe('PDFThumbnails Property Tests', () => {
  /**
   * Property 27: Thumbnail Count Consistency
   * 
   * For any loaded PDF document, the number of generated thumbnails 
   * SHALL equal the document's page count.
   * 
   * **Validates: Requirements 3.2, 3.6**
   */
  describe('Property 27: Thumbnail Count Consistency', () => {
    it('should generate exactly pageCount thumbnails for any valid page count', () => {
      fc.assert(
        fc.property(
          // Generate page counts from 1 to 10000 (reasonable PDF size range)
          fc.integer({ min: 1, max: 10000 }),
          (pageCount) => {
            const thumbnailPages = generateThumbnailPages(pageCount);
            
            // Property: thumbnail count equals page count
            expect(thumbnailPages.length).toBe(pageCount);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should generate sequential page numbers starting from 1', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }),
          (pageCount) => {
            const thumbnailPages = generateThumbnailPages(pageCount);
            
            // Property: pages are sequential starting from 1
            for (let i = 0; i < thumbnailPages.length; i++) {
              expect(thumbnailPages[i]).toBe(i + 1);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return empty array for zero or negative page counts', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -1000, max: 0 }),
          (pageCount) => {
            const thumbnailPages = generateThumbnailPages(pageCount);
            
            // Property: invalid page counts produce empty array
            expect(thumbnailPages.length).toBe(0);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should include all page numbers from 1 to pageCount', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 500 }),
          (pageCount) => {
            const thumbnailPages = generateThumbnailPages(pageCount);
            
            // Property: first page is 1
            expect(thumbnailPages[0]).toBe(1);
            
            // Property: last page equals pageCount
            expect(thumbnailPages[thumbnailPages.length - 1]).toBe(pageCount);
            
            // Property: all pages are unique
            const uniquePages = new Set(thumbnailPages);
            expect(uniquePages.size).toBe(pageCount);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should produce consistent results for the same input', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }),
          (pageCount) => {
            const result1 = generateThumbnailPages(pageCount);
            const result2 = generateThumbnailPages(pageCount);
            
            // Property: function is deterministic
            expect(result1).toEqual(result2);
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});

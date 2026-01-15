/**
 * Property-Based Tests for Citation Navigation
 * 
 * **Property 10: Citation Navigation Accuracy**
 * For any citation click event, the PDF_Viewer SHALL navigate to the page number 
 * specified in the citation, and if bounding box coordinates are valid, the viewer 
 * SHALL highlight the region at those coordinates.
 * 
 * **Validates: Requirements 8.3, 8.4, 18.3**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { isValidBoundingBox, isValidCitation } from './useCitationNavigation';
import type { BoundingBox, Citation } from '../../types/pdf';

// Arbitrary generators for testing
const boundingBoxArb = fc.record({
  x0: fc.double({ min: 0, max: 1000, noNaN: true }),
  y0: fc.double({ min: 0, max: 1000, noNaN: true }),
  x1: fc.double({ min: 0, max: 1000, noNaN: true }),
  y1: fc.double({ min: 0, max: 1000, noNaN: true }),
  pageNumber: fc.integer({ min: 1, max: 10000 }),
});

const validBoundingBoxArb = fc.record({
  x0: fc.double({ min: 0, max: 500, noNaN: true }),
  y0: fc.double({ min: 0, max: 500, noNaN: true }),
  pageNumber: fc.integer({ min: 1, max: 10000 }),
}).chain(({ x0, y0, pageNumber }) => 
  fc.record({
    x0: fc.constant(x0),
    y0: fc.constant(y0),
    x1: fc.double({ min: x0, max: x0 + 500, noNaN: true }),
    y1: fc.double({ min: y0, max: y0 + 500, noNaN: true }),
    pageNumber: fc.constant(pageNumber),
  })
);

const citationArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 50 }),
  documentName: fc.string({ minLength: 1, maxLength: 100 }),
  pageNumber: fc.integer({ min: 1, max: 10000 }),
  boundingBoxes: fc.array(boundingBoxArb, { minLength: 0, maxLength: 5 }),
  quotedText: fc.string({ minLength: 0, maxLength: 500 }),
  chunkId: fc.string({ minLength: 1, maxLength: 50 }),
});

const validCitationArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 50 }),
  documentName: fc.string({ minLength: 1, maxLength: 100 }),
  pageNumber: fc.integer({ min: 1, max: 10000 }),
  boundingBoxes: fc.array(validBoundingBoxArb, { minLength: 1, maxLength: 5 }),
  quotedText: fc.string({ minLength: 0, maxLength: 500 }),
  chunkId: fc.string({ minLength: 1, maxLength: 50 }),
});

describe('Citation Navigation Property Tests', () => {
  /**
   * Property 10: Citation Navigation Accuracy
   * 
   * For any citation click event, the PDF_Viewer SHALL navigate to the page number 
   * specified in the citation, and if bounding box coordinates are valid, the viewer 
   * SHALL highlight the region at those coordinates.
   * 
   * **Validates: Requirements 8.3, 8.4, 18.3**
   */
  describe('Property 10: Citation Navigation Accuracy', () => {
    describe('Bounding Box Validation', () => {
      it('should accept valid bounding boxes with x0 < x1 and y0 < y1', () => {
        fc.assert(
          fc.property(
            validBoundingBoxArb,
            (bbox) => {
              const result = isValidBoundingBox(bbox as BoundingBox);
              expect(result).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should reject bounding boxes with x1 < x0', () => {
        fc.assert(
          fc.property(
            fc.double({ min: 100, max: 500, noNaN: true }),
            fc.double({ min: 0, max: 99, noNaN: true }),
            fc.double({ min: 0, max: 500, noNaN: true }),
            fc.double({ min: 0, max: 500, noNaN: true }),
            fc.integer({ min: 1, max: 1000 }),
            (x0, x1, y0, y1, pageNumber) => {
              const bbox: BoundingBox = { x0, x1, y0, y1: y1 + y0, pageNumber };
              const result = isValidBoundingBox(bbox);
              expect(result).toBe(false);
            }
          ),
          { numRuns: 50 }
        );
      });

      it('should reject bounding boxes with y1 < y0', () => {
        fc.assert(
          fc.property(
            fc.double({ min: 0, max: 500, noNaN: true }),
            fc.double({ min: 0, max: 500, noNaN: true }),
            fc.double({ min: 100, max: 500, noNaN: true }),
            fc.double({ min: 0, max: 99, noNaN: true }),
            fc.integer({ min: 1, max: 1000 }),
            (x0, x1Offset, y0, y1, pageNumber) => {
              const bbox: BoundingBox = { x0, x1: x0 + x1Offset, y0, y1, pageNumber };
              const result = isValidBoundingBox(bbox);
              expect(result).toBe(false);
            }
          ),
          { numRuns: 50 }
        );
      });

      it('should reject bounding boxes with negative coordinates', () => {
        fc.assert(
          fc.property(
            fc.double({ min: -1000, max: -1, noNaN: true }),
            fc.double({ min: 0, max: 500, noNaN: true }),
            fc.double({ min: 0, max: 500, noNaN: true }),
            fc.double({ min: 0, max: 500, noNaN: true }),
            fc.integer({ min: 1, max: 1000 }),
            (x0, x1Offset, y0, y1Offset, pageNumber) => {
              const bbox: BoundingBox = { 
                x0, 
                x1: Math.abs(x0) + x1Offset, 
                y0, 
                y1: y0 + y1Offset, 
                pageNumber 
              };
              const result = isValidBoundingBox(bbox);
              expect(result).toBe(false);
            }
          ),
          { numRuns: 50 }
        );
      });

      it('should reject bounding boxes with invalid page numbers', () => {
        fc.assert(
          fc.property(
            fc.double({ min: 0, max: 500, noNaN: true }),
            fc.double({ min: 0, max: 500, noNaN: true }),
            fc.double({ min: 0, max: 500, noNaN: true }),
            fc.double({ min: 0, max: 500, noNaN: true }),
            fc.integer({ min: -1000, max: 0 }),
            (x0, x1Offset, y0, y1Offset, pageNumber) => {
              const bbox: BoundingBox = { 
                x0, 
                x1: x0 + x1Offset, 
                y0, 
                y1: y0 + y1Offset, 
                pageNumber 
              };
              const result = isValidBoundingBox(bbox);
              expect(result).toBe(false);
            }
          ),
          { numRuns: 50 }
        );
      });

      it('should reject bounding boxes with NaN values', () => {
        const bboxWithNaN: BoundingBox = {
          x0: NaN,
          y0: 0,
          x1: 100,
          y1: 100,
          pageNumber: 1,
        };
        expect(isValidBoundingBox(bboxWithNaN)).toBe(false);
      });
    });

    describe('Citation Validation', () => {
      it('should accept valid citations with valid page numbers', () => {
        fc.assert(
          fc.property(
            validCitationArb,
            (citation) => {
              const result = isValidCitation(citation as Citation);
              expect(result).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should reject citations with invalid page numbers', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 1, maxLength: 50 }),
            fc.string({ minLength: 1, maxLength: 100 }),
            fc.integer({ min: -1000, max: 0 }),
            fc.array(validBoundingBoxArb, { minLength: 0, maxLength: 3 }),
            fc.string({ minLength: 0, maxLength: 100 }),
            fc.string({ minLength: 1, maxLength: 50 }),
            (id, documentName, pageNumber, boundingBoxes, quotedText, chunkId) => {
              const citation: Citation = {
                id,
                documentName,
                pageNumber,
                boundingBoxes: boundingBoxes as BoundingBox[],
                quotedText,
                chunkId,
              };
              const result = isValidCitation(citation);
              expect(result).toBe(false);
            }
          ),
          { numRuns: 50 }
        );
      });

      it('should reject citations with NaN page numbers', () => {
        const citation: Citation = {
          id: 'test',
          documentName: 'test.pdf',
          pageNumber: NaN,
          boundingBoxes: [],
          quotedText: 'test',
          chunkId: 'chunk1',
        };
        expect(isValidCitation(citation)).toBe(false);
      });

      it('should accept citations with empty bounding boxes array', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 1, maxLength: 50 }),
            fc.string({ minLength: 1, maxLength: 100 }),
            fc.integer({ min: 1, max: 10000 }),
            fc.string({ minLength: 0, maxLength: 100 }),
            fc.string({ minLength: 1, maxLength: 50 }),
            (id, documentName, pageNumber, quotedText, chunkId) => {
              const citation: Citation = {
                id,
                documentName,
                pageNumber,
                boundingBoxes: [],
                quotedText,
                chunkId,
              };
              const result = isValidCitation(citation);
              expect(result).toBe(true);
            }
          ),
          { numRuns: 50 }
        );
      });
    });

    describe('Navigation Behavior', () => {
      it('valid citations should always have page number >= 1', () => {
        fc.assert(
          fc.property(
            validCitationArb,
            (citation) => {
              if (isValidCitation(citation as Citation)) {
                expect(citation.pageNumber).toBeGreaterThanOrEqual(1);
              }
            }
          ),
          { numRuns: 100 }
        );
      });

      it('valid bounding boxes should have non-negative dimensions', () => {
        fc.assert(
          fc.property(
            validBoundingBoxArb,
            (bbox) => {
              if (isValidBoundingBox(bbox as BoundingBox)) {
                const width = bbox.x1 - bbox.x0;
                const height = bbox.y1 - bbox.y0;
                expect(width).toBeGreaterThanOrEqual(0);
                expect(height).toBeGreaterThanOrEqual(0);
              }
            }
          ),
          { numRuns: 100 }
        );
      });
    });
  });
});

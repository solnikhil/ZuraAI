/**
 * Property-Based Tests for Citation Parsing
 * 
 * **Property 9: Citation Format Consistency**
 * For any citation in an AI response, the citation SHALL match the format pattern 
 * `[[cite:CHUNK_ID:pPAGE_NUMBER]]` and SHALL be parseable to extract chunk ID and page number.
 * 
 * **Validates: Requirements 8.2, 8.6**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseCitations, formatCitationDisplay, CITATION_PATTERN } from './PDFChatArea';
import type { Citation } from '../../types/pdf';

// Generator for valid chunk IDs (alphanumeric with underscores and hyphens)
const chunkIdArb = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-'.split('')),
  { minLength: 1, maxLength: 30 }
);

// Generator for valid page numbers
const pageNumberArb = fc.integer({ min: 1, max: 10000 });

// Generator for citation markers in the expected format
const citationMarkerArb = fc.tuple(chunkIdArb, pageNumberArb).map(
  ([chunkId, pageNumber]) => `[[cite:${chunkId}:p${pageNumber}]]`
);

// Generator for text content without citation markers
const plainTextArb = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,!?;:\n'.split('')),
  { minLength: 0, maxLength: 200 }
);

// Generator for text with embedded citations
const textWithCitationsArb = fc.tuple(
  plainTextArb,
  fc.array(fc.tuple(plainTextArb, citationMarkerArb), { minLength: 1, maxLength: 5 }),
  plainTextArb
).map(([prefix, citationPairs, suffix]) => {
  let text = prefix;
  for (const [textBefore, citation] of citationPairs) {
    text += textBefore + citation;
  }
  text += suffix;
  return text;
});


describe('Citation Parsing Property Tests', () => {
  /**
   * Property 9: Citation Format Consistency
   * 
   * For any citation in an AI response, the citation SHALL match the format pattern 
   * `[[cite:CHUNK_ID:pPAGE_NUMBER]]` and SHALL be parseable to extract chunk ID and page number.
   * 
   * **Validates: Requirements 8.2, 8.6**
   */
  describe('Property 9: Citation Format Consistency', () => {
    describe('Citation Pattern Matching', () => {
      it('should match valid citation format [[cite:CHUNK_ID:pPAGE_NUMBER]]', () => {
        fc.assert(
          fc.property(
            chunkIdArb,
            pageNumberArb,
            (chunkId, pageNumber) => {
              const citationText = `[[cite:${chunkId}:p${pageNumber}]]`;
              const pattern = /\[\[cite:([a-zA-Z0-9_-]+):p(\d+)\]\]/g;
              const match = pattern.exec(citationText);
              
              expect(match).not.toBeNull();
              expect(match![1]).toBe(chunkId);
              expect(parseInt(match![2], 10)).toBe(pageNumber);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should extract correct chunk ID from citation', () => {
        fc.assert(
          fc.property(
            chunkIdArb,
            pageNumberArb,
            (chunkId, pageNumber) => {
              const citationText = `Some text [[cite:${chunkId}:p${pageNumber}]] more text`;
              const chunkMap = new Map<string, { documentName: string; pageNumber: number; quotedText: string }>();
              chunkMap.set(chunkId, { documentName: 'test.pdf', pageNumber, quotedText: 'test quote' });
              
              const { citations } = parseCitations(citationText, chunkMap);
              
              expect(citations.length).toBe(1);
              expect(citations[0].chunkId).toBe(chunkId);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should extract correct page number from citation', () => {
        fc.assert(
          fc.property(
            chunkIdArb,
            pageNumberArb,
            (chunkId, pageNumber) => {
              const citationText = `[[cite:${chunkId}:p${pageNumber}]]`;
              const chunkMap = new Map<string, { documentName: string; pageNumber: number; quotedText: string }>();
              
              const { citations } = parseCitations(citationText, chunkMap);
              
              expect(citations.length).toBe(1);
              expect(citations[0].pageNumber).toBe(pageNumber);
            }
          ),
          { numRuns: 100 }
        );
      });
    });
